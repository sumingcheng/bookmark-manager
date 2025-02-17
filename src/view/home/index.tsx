import { FolderGrid } from '@/components/folder-grid'
import { LinkEditDialog } from '@/components/link-edit-dialog'
import { LinkList } from '@/components/link-list'
import { NavBar } from '@/components/nav-bar'
import { importChromeBookmarks } from '@/services/bookmarks'
import type { Folder, Link } from '@/services/db'
import { db } from '@/services/db'
import { hotkeys } from '@/services/hotkeys'
import { fetchPageTitle } from '@/utils/fetch-title'
import { nanoid } from 'nanoid'
import { useCallback, useEffect, useState } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import toast from 'react-hot-toast'

export default function Home() {
  const [links, setLinks] = useState<Link[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [sortBy, setSortBy] = useState<'createdAt' | 'useCount'>('createdAt')
  const [editingLink, setEditingLink] = useState<Link | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [isSearching, setIsSearching] = useState(false)

  // 加载初始数据
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true)
        const [loadedLinks, loadedFolders] = await Promise.all([
          db.getAllLinks(),
          db.getAllFolders()
        ])
        setLinks(loadedLinks)
        setFolders(loadedFolders)
      } catch (error: unknown) {
        console.error('加载数据失败:', error)
        toast.error('加载数据失败')
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [])

  // 加载所有标签
  useEffect(() => {
    const tags = links.reduce((acc, link) => {
      link.tags.forEach(tag => {
        if (!acc.includes(tag)) {
          acc.push(tag)
        }
      })
      return acc
    }, [] as string[])
    setAllTags(tags)
  }, [links])

  // 添加新链接
  const handleAddLink = useCallback(async (url: string) => {
    try {
      const title = await fetchPageTitle(url)
      
      const newLink: Link = {
        id: nanoid(),
        name: title || url,
        url,
        tags: [],
        createdAt: Date.now(),
        useCount: 0
      }
      await db.addLink(newLink)
      setLinks(prev => [...prev, newLink])
      toast.success('添加链接成功')
    } catch (error: unknown) {
      console.error('添加链接失败:', error)
      toast.error('添加链接失败')
    }
  }, [])

  // 修改链接处理函数
  const handleSaveLink = async (updatedLink: Link) => {
    try {
      await db.updateLink(updatedLink.id, updatedLink)
      setLinks(prev => prev.map(link => 
        link.id === updatedLink.id ? updatedLink : link
      ))
      toast.success('更新链接成功')
    } catch (error: unknown) {
      console.error('更新链接失败:', error)
      toast.error('更新链接失败')
    }
  }

  // 添加文件夹
  const handleAddFolder = async (parentId?: string) => {
    try {
      const newFolder: Folder = {
        id: nanoid(),
        name: '新建文件夹',
        parentId,
        children: [],
        links: [],
        createdAt: Date.now(),
        order: folders.length
      }
      await db.addFolder(newFolder)
      setFolders(prev => [...prev, newFolder])
      toast.success('创建文件夹成功')
    } catch (error) {
      toast.error('创建文件夹失败')
    }
  }

  // 重命名文件夹
  const handleRename = async (folderId: string, newName: string) => {
    try {
      await db.updateFolder(folderId, { name: newName })
      setFolders(folders.map(folder => 
        folder.id === folderId ? { ...folder, name: newName } : folder
      ))
      toast.success('重命名成功')
    } catch (error) {
      toast.error('重命名失败')
    }
  }

  // 拖拽链接到文件夹
  const handleDrop = async (folderId: string, linkId: string) => {
    try {
      const folder = folders.find(f => f.id === folderId)
      if (folder && !folder.links.includes(linkId)) {
        const updatedFolder: Folder = {
          ...folder,
          links: [...folder.links, linkId]
        }
        await db.updateFolder(folderId, updatedFolder)
        setFolders(folders.map(f => 
          f.id === folderId ? updatedFolder : f
        ))
        toast.success('移动链接成功')
      }
    } catch (error) {
      toast.error('移动链接失败')
    }
  }

  // 更新链接使用次数
  const handleLinkClick = async (linkId: string) => {
    try {
      await db.incrementLinkUseCount(linkId)
      const updatedLinks = await db.getAllLinks()
      setLinks(updatedLinks)
    } catch (error) {
      console.error('更新使用次数失败:', error)
    }
  }

  // 删除链接
  const handleDeleteLink = async (linkId: string) => {
    if (!window.confirm('确定要删除这个链接吗？')) return

    try {
      await db.deleteLink(linkId)
      setLinks(links.filter(link => link.id !== linkId))
      // 更新文件夹中的链接引用
      const updatedFolders = folders.map(folder => ({
        ...folder,
        links: folder.links.filter(id => id !== linkId)
      }))
      await Promise.all(
        updatedFolders.map(folder => db.updateFolder(folder.id, folder))
      )
      setFolders(updatedFolders)
      toast.success('链接已删除')
    } catch (error) {
      toast.error('删除失败')
    }
  }

  // 删除文件夹
  const handleDeleteFolder = async (folderId: string) => {
    try {
      // 递归获取所有子文件夹ID
      const getChildFolderIds = (parentId: string): string[] => {
        const children = folders
          .filter(f => f.parentId === parentId)
          .map(f => f.id)
        return [
          ...children,
          ...children.flatMap(childId => getChildFolderIds(childId))
        ]
      }

      const folderIds = [folderId, ...getChildFolderIds(folderId)]
      
      // 删除文件夹及其子文件夹
      await Promise.all(folderIds.map(id => db.deleteFolder(id)))
      setFolders(folders.filter(f => !folderIds.includes(f.id)))
      toast.success('文件夹已删除')
    } catch (error) {
      toast.error('删除失败')
    }
  }

  // 导入书签
  const handleImportBookmarks = async () => {
    try {
      const { links: importedLinks, folders: importedFolders } = await importChromeBookmarks()
      
      // 批量添加到数据库
      await Promise.all([
        ...importedLinks.map(link => db.addLink(link)),
        ...importedFolders.map(folder => db.addFolder(folder))
      ])

      // 更新状态
      setLinks(prev => [...prev, ...importedLinks])
      setFolders(prev => [...prev, ...importedFolders])
      
      toast.success(`成功导入 ${importedLinks.length} 个书签，${importedFolders.length} 个文件夹`)
    } catch (error: unknown) {
      console.error('导入书签失败:', error)
      toast.error('导入书签失败')
    }
  }

  // 修改排序处理函数
  const handleSortChange = (newSortBy: 'createdAt' | 'useCount') => {
    if (sortBy === newSortBy) {
      setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc')
    } else {
      setSortBy(newSortBy)
      setSortDirection('desc')
    }
  }

  const sortedLinks = [...links].sort((a, b) => {
    const multiplier = sortDirection === 'desc' ? 1 : -1
    if (sortBy === 'createdAt') {
      return (b.createdAt - a.createdAt) * multiplier
    }
    return (b.useCount - a.useCount) * multiplier
  })

  // 处理搜索
  const handleSearch = useCallback(async (term: string) => {
    setIsSearching(true)
    try {
      setSearchTerm(term)
    } finally {
      setIsSearching(false)
    }
  }, [])

  // 过滤链接
  const filteredLinks = sortedLinks.filter(link => {
    if (!searchTerm) return true
    return (
      link.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      link.url.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  useEffect(() => {
    // 注册快捷键
    hotkeys.registerShortcut({
      key: 'n',
      ctrl: true,
      alt: true,
      shift: false,
      description: '新建链接',
      callback: () => {
        const url = window.prompt('请输入链接地址')
        if (url) handleAddLink(url)
      }
    })

    return () => {
      hotkeys.unregisterShortcut('n')
    }
  }, [handleAddLink])

  // 在使用 FolderGrid 的组件中
  const handleReorder = async (dragIndex: number, hoverIndex: number) => {
    const newFolders = [...folders]
    const [draggedFolder] = newFolders.splice(dragIndex, 1)
    newFolders.splice(hoverIndex, 0, draggedFolder)
    
    // 更新所有受影响文件夹的 order
    const updatedFolders = newFolders.map((folder, index) => ({
      ...folder,
      order: index
    }))
    
    // 更新状态
    setFolders(updatedFolders)
    
    // 保存到数据库
    try {
      await db.updateFoldersOrder(updatedFolders)
    } catch (error) {
      console.error('Failed to save folder order:', error)
      toast.error('保存文件夹顺序失败')
    }
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex flex-col h-screen bg-gray-50">
        <NavBar />
        <FolderGrid
          folders={folders
            .filter(folder => !folder.parentId)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          }
          isLoading={isLoading}
          onAddFolder={() => handleAddFolder()}
          onRename={handleRename}
          onDelete={handleDeleteFolder}
          onDrop={handleDrop}
          onReorder={handleReorder}
        />

        <LinkList
          links={filteredLinks}
          isLoading={isLoading}
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSortChange={handleSortChange}
          onSearch={handleSearch}
          isSearching={isSearching}
          onTagSelect={(tag: string) => {
            setSelectedTags(prev =>
              prev.includes(tag)
                ? prev.filter(t => t !== tag)
                : [...prev, tag]
            )
          }}
          onTagsClear={() => setSelectedTags([])}
          onImport={handleImportBookmarks}
          onEdit={setEditingLink}
          onDelete={handleDeleteLink}
          onLinkClick={handleLinkClick}
        />

        <LinkEditDialog
          link={editingLink}
          isOpen={!!editingLink}
          onClose={() => setEditingLink(null)}
          onSave={handleSaveLink}
        />
      </div>
    </DndProvider>
  )
}
