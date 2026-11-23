import React from 'react';
import { useStorage } from '../context/StorageContext';
import {
  ChevronRight,
  Folder,
  Home,
  CheckSquare,
  ArrowLeft,
  Star,
  Trash2,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  Code2,
  FolderPlus,
  FilePlus
} from 'lucide-react';

export function Breadcrumbs() {
  const {
    folderPath,
    currentFolderId,
    navigateToFolder,
    activeCategory,
    displayedFolders,
    displayedFiles,
    selectedItems,
    selectAllDisplayedItems,
    batchDeletePermanently,
    setIsNewFolderOpen,
    requestConfirm
  } = useStorage();

  const totalItems = displayedFolders.length + displayedFiles.length;

  const categoryMeta = {
    all: null,
    starred: {
      title: 'Starred',
      subtitle: 'Favorite files and folders',
      icon: <Star size={16} fill="#f59e0b" color="#f59e0b" />
    },
    trash: {
      title: 'Trash',
      subtitle: currentFolderId ? 'Inspecting trashed folder contents (click any file to preview)' : 'Items in trash (click any folder or file to preview)',
      icon: <Trash2 size={16} color="var(--accent-rose)" />
    },
    document: {
      title: 'Documents',
      subtitle: 'PDFs, Word documents, notes and spreadsheets',
      icon: <FileText size={16} color="var(--accent-emerald)" />
    },
    image: {
      title: 'Photos & Media',
      subtitle: 'Images, graphics and screenshots',
      icon: <ImageIcon size={16} color="var(--accent-primary)" />
    },
    video: {
      title: 'Videos',
      subtitle: 'Video recordings and media clips',
      icon: <Video size={16} color="var(--accent-rose)" />
    },
    audio: {
      title: 'Audio',
      subtitle: 'Voice notes, tracks and music',
      icon: <Music size={16} color="var(--accent-amber)" />
    },
    code: {
      title: 'Code',
      subtitle: 'Development scripts and configuration',
      icon: <Code2 size={16} color="var(--accent-secondary)" />
    }
  };

  const parentFolderItem = (folderPath || []).length > 1 ? folderPath[folderPath.length - 2] : null;
  const currentCategory = categoryMeta[activeCategory];
  const isInsideSubfolder = Boolean(currentFolderId);

  const handleEmptyTrash = () => {
    const allTrashIds = [...displayedFolders, ...displayedFiles].map(i => i.id);
    if (allTrashIds.length === 0) return;
    requestConfirm({
      title: 'Empty Trash Permanently',
      message: `Are you sure you want to permanently delete all ${allTrashIds.length} item(s) in Trash? This action cannot be undone.`,
      confirmText: 'Empty Trash',
      danger: true,
      onConfirm: async () => {
        await batchDeletePermanently(allTrashIds);
      }
    });
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      marginBottom: '16px',
      paddingBottom: '12px',
      borderBottom: '1px solid var(--border-subtle)',
      flexWrap: 'wrap'
    }}>
      {/* Left Trail & Category Context */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flexWrap: 'wrap' }}>
        {isInsideSubfolder && (
          <button
            className="btn btn-secondary"
            onClick={() =>
              navigateToFolder(
                parentFolderItem ? parentFolderItem.id : null,
                parentFolderItem ? parentFolderItem.name : 'My Vault',
                activeCategory
              )
            }
            style={{ padding: '5px 10px', borderRadius: '7px', fontSize: '0.78rem', fontWeight: 600, gap: '4px' }}
            title="Go back one folder level"
          >
            <ArrowLeft size={13} />
            <span>Back</span>
          </button>
        )}

        {currentCategory ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div
              onClick={() => isInsideSubfolder && navigateToFolder(null, currentCategory.title, activeCategory)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: isInsideSubfolder ? 'pointer' : 'default'
              }}
            >
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '7px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {currentCategory.icon}
              </div>
              <div>
                <div style={{ fontSize: '0.96rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  {currentCategory.title}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {currentCategory.subtitle}
                </div>
              </div>
            </div>

            {/* If inside a folder while in a Category or Trash view, show the exact folder trail */}
            {isInsideSubfolder && (folderPath || []).length > 1 && (
              <nav style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginLeft: '4px' }}>
                {(folderPath || []).slice(1).map((item, idx, arr) => {
                  const isLast = idx === arr.length - 1;
                  return (
                    <React.Fragment key={item.id || idx}>
                      <ChevronRight size={13} color="var(--text-muted)" />
                      <button
                        onClick={() => navigateToFolder(item.id, item.name, activeCategory)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: isLast ? 'var(--bg-surface)' : 'transparent',
                          border: isLast ? '1px solid var(--border-subtle)' : 'none',
                          padding: '4px 9px',
                          borderRadius: '6px',
                          color: isLast ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontWeight: isLast ? 600 : 500,
                          fontSize: '0.82rem',
                          cursor: 'pointer'
                        }}
                      >
                        <Folder size={13} color="var(--accent-primary)" />
                        <span>{item.name}</span>
                      </button>
                    </React.Fragment>
                  );
                })}
              </nav>
            )}
          </div>
        ) : (
          <nav style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            {(folderPath || []).map((item, index) => {
              const isLast = index === (folderPath || []).length - 1;
              return (
                <React.Fragment key={index}>
                  {index > 0 && <ChevronRight size={13} color="var(--text-muted)" />}
                  <button
                    onClick={() => navigateToFolder(item.id, item.name, 'all')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: isLast ? 'var(--bg-surface)' : 'transparent',
                      border: isLast ? '1px solid var(--border-subtle)' : 'none',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      color: isLast ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: isLast ? 600 : 500,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {index === 0 ? <Home size={13} color="var(--text-muted)" /> : <Folder size={13} color="var(--accent-primary)" />}
                    <span>{item.name}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
        )}
      </div>

      {/* Right Controls: New Folder/File, Empty Trash, Select All & Counter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {activeCategory !== 'trash' && activeCategory !== 'starred' && (
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsNewFolderOpen('folder')}
              style={{
                padding: '5px 10px',
                fontSize: '0.75rem',
                fontWeight: 500,
                borderRadius: '6px',
                gap: '5px',
                color: 'var(--text-secondary)'
              }}
              title="Create a new folder"
            >
              <FolderPlus size={13} />
              <span>New Folder</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsNewFolderOpen('file')}
              style={{
                padding: '5px 10px',
                fontSize: '0.75rem',
                fontWeight: 500,
                borderRadius: '6px',
                gap: '5px',
                color: 'var(--text-secondary)'
              }}
              title="Create a new document"
            >
              <FilePlus size={13} />
              <span>New Document</span>
            </button>
          </>
        )}

        {activeCategory === 'trash' && totalItems > 0 && (
          <button
            className="btn btn-danger"
            onClick={handleEmptyTrash}
            style={{ padding: '4px 10px', fontSize: '0.76rem', borderRadius: '6px', gap: '5px' }}
          >
            <Trash2 size={13} />
            <span>Empty Trash</span>
          </button>
        )}

        {totalItems > 0 && (
          <button
            className="btn btn-secondary"
            onClick={selectAllDisplayedItems}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 500,
              gap: '6px',
              border: selectedItems.length > 0 ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
              color: selectedItems.length > 0 ? 'var(--accent-primary)' : 'var(--text-secondary)'
            }}
          >
            <CheckSquare size={13} />
            <span>{selectedItems.length >= totalItems && totalItems > 0 ? 'Deselect All' : `Select All (${totalItems})`}</span>
          </button>
        )}

        <div style={{
          fontSize: '0.74rem',
          color: 'var(--text-muted)',
          fontVariantNumeric: 'tabular-nums',
          background: 'var(--bg-input)',
          padding: '3px 8px',
          borderRadius: '5px',
          border: '1px solid var(--border-subtle)'
        }}>
          <span>{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}
