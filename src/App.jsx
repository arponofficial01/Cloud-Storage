import React, { useState, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { StorageProvider, useStorage } from './context/StorageContext';

import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { Breadcrumbs } from './components/Breadcrumbs';
import { FileGrid } from './components/FileGrid';
import { FileList } from './components/FileList';
import { AuthLandingPage } from './components/AuthLandingPage';

import { UploadModal } from './components/UploadModal';
import { NewFolderModal } from './components/NewFolderModal';
import { FilePreviewModal } from './components/FilePreviewModal';
import { ShareModal } from './components/ShareModal';
import { AuthModal } from './components/AuthModal';

import { CommandPalette } from './components/CommandPalette';
import { ActivityLogDrawer } from './components/ActivityLogDrawer';
import { MediaPlayerBar } from './components/MediaPlayerBar';
import { BatchActionBar } from './components/BatchActionBar';
import { VaultPasscodeModal } from './components/VaultPasscodeModal';
import { AiCopilotDrawer } from './components/AiCopilotDrawer';

import { ToastContainer } from './components/Toast';
import { MoveToFolderModal } from './components/MoveToFolderModal';
import { ConfirmDialogModal } from './components/ConfirmDialogModal';
import { MobileBottomBar } from './components/MobileBottomBar';

import { UploadCloud, Loader2 } from 'lucide-react';

// Lazy-loaded heavy modules and studios
const ConverterStudioPage = lazy(() => import('./components/ConverterStudioPage').then(m => ({ default: m.ConverterStudioPage })));
const ProfilePage = lazy(() => import('./components/ProfilePage').then(m => ({ default: m.ProfilePage })));
const AdminPanelPage = lazy(() => import('./components/AdminPanelPage').then(m => ({ default: m.AdminPanelPage })));
const SharedFilePage = lazy(() => import('./components/SharedFilePage').then(m => ({ default: m.SharedFilePage })));
const StorageAnalyticsModal = lazy(() => import('./components/StorageAnalyticsModal').then(m => ({ default: m.StorageAnalyticsModal })));
const SubscriptionModal = lazy(() => import('./components/SubscriptionModal').then(m => ({ default: m.SubscriptionModal })));
const WindowsDriveModal = lazy(() => import('./components/WindowsDriveModal').then(m => ({ default: m.WindowsDriveModal })));

function AppContent() {
  const { user, authLoading } = useAuth();
  const { moveModalTarget, setMoveModalTarget } = useStorage();
  const params = new URLSearchParams(window.location.search);
  const shareId = params.get('share');
  const sharePass = params.get('pass');

  const {
    activeCategory,
    viewMode,
    uploadFiles,
    isSubscriptionOpen,
    setIsSubscriptionOpen,
    currentMusicTrack,
    isMusicPlaying,
    setIsMusicPlaying,
    isMusicMuted,
    isMusicLooping,
    selectedItems,
    selectAllDisplayedItems,
    clearSelection,
    batchMoveToTrash,
    batchDeletePermanently,
    setIsCommandPaletteOpen,
    activePreview
  } = useStorage();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isWindowDragActive, setIsWindowDragActive] = useState(false);
  const [isAiCopilotOpen, setIsAiCopilotOpen] = useState(false);

  const globalAudioRef = React.useRef(null);

  // Global Desktop Keyboard Shortcuts (Ctrl+K, Ctrl+A, Delete, Escape)
  React.useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const tag = (e.target?.tagName || '').toUpperCase();
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
        return;
      }

      if (isEditable || activePreview) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        if (activeCategory !== 'profile' && activeCategory !== 'converter') {
          e.preventDefault();
          selectAllDisplayedItems();
        }
      } else if (e.key === 'Delete' && selectedItems.length > 0) {
        e.preventDefault();
        if (activeCategory === 'trash') {
          batchDeletePermanently();
        } else {
          batchMoveToTrash();
        }
      } else if (e.key === 'Escape' && selectedItems.length > 0) {
        clearSelection();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    activeCategory,
    activePreview,
    selectedItems,
    selectAllDisplayedItems,
    clearSelection,
    batchMoveToTrash,
    batchDeletePermanently,
    setIsCommandPaletteOpen
  ]);

  // Sync background music playback globally across all views & page reloads
  React.useEffect(() => {
    const audio = globalAudioRef.current;
    if (!audio) return;

    // Restore saved playback timestamp on fresh open / refresh
    try {
      const savedTime = sessionStorage.getItem('storagebank_music_time');
      if (savedTime && !isNaN(parseFloat(savedTime)) && audio.currentTime === 0) {
        audio.currentTime = parseFloat(savedTime);
      }
    } catch {}

    if (isMusicPlaying) {
      const attemptPlay = () => {
        const promise = audio.play();
        if (promise !== undefined) {
          promise.then(() => {
            // Playing successfully without block!
          }).catch(() => {
            // Autoplay blocked by browser policy — trigger immediately on first user micro-interaction
            const unlockAudio = () => {
              if (globalAudioRef.current) {
                globalAudioRef.current.play().catch(() => {});
              }
              ['pointerdown', 'click', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(evt => {
                window.removeEventListener(evt, unlockAudio);
                document.removeEventListener(evt, unlockAudio);
              });
            };
            ['pointerdown', 'click', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(evt => {
              window.addEventListener(evt, unlockAudio, { once: true, passive: true });
              document.addEventListener(evt, unlockAudio, { once: true, passive: true });
            });
          });
        }
      };

      attemptPlay();
    } else {
      audio.pause();
    }
  }, [isMusicPlaying, currentMusicTrack?.url]);

  // Drag and Drop anywhere on the window
  const handleWindowDragOver = (e) => {
    e.preventDefault();
    setIsWindowDragActive(true);
  };

  const handleWindowDragLeave = (e) => {
    if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
      setIsWindowDragActive(false);
    }
  };

  const handleWindowDrop = (e) => {
    e.preventDefault();
    setIsWindowDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  const renderMainContent = () => {
    if (shareId) {
      return (
        <Suspense fallback={<div className="loading-spinner"><Loader2 size={36} className="spin" /></div>}>
          <SharedFilePage sharedFileId={shareId} requiredPasscode={sharePass} />
        </Suspense>
      );
    }

    // Show spinner while Supabase restores session from localStorage
    if (authLoading) {
      return (
        <div style={{
          minHeight: '100vh', width: '100vw',
          background: 'radial-gradient(circle at 50% 20%, #1e1b4b 0%, #030712 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0
        }}>
          <Loader2 size={48} color="#6366f1" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      );
    }

    // If no user is logged in, show the ultra-premium AuthLandingPage!
    if (!user) {
      return <AuthLandingPage />;
    }

    return (
      <div
        className="app-container"
        onDragOver={handleWindowDragOver}
        onDragLeave={handleWindowDragLeave}
        onDrop={handleWindowDrop}
      >
        {/* Master PIN Passcode Lock Screen Modal */}
        <VaultPasscodeModal />

      {/* Full Window Drop Overlay */}
      {isWindowDragActive && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(99, 102, 241, 0.28)',
          backdropFilter: 'blur(16px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          border: '4px dashed var(--accent-primary)',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <UploadCloud size={72} color="var(--accent-primary)" className="pulse" />
          <h2 style={{ fontSize: '2rem', fontWeight: '800', marginTop: '16px', color: '#ffffff' }}>
            Drop files anywhere to upload instantly
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', marginTop: '6px' }}>
            Your files will be encrypted and stored directly in your cloud vault
          </p>
        </div>
      )}

      {/* Left Sidebar */}
      <Sidebar
        isOpen={isMobileSidebarOpen}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Mobile Backdrop */}
      {isMobileSidebarOpen && (
        <div
          onClick={() => setIsMobileSidebarOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 400
          }}
        />
      )}

      {/* Main Content Workspace */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Navbar */}
        <Navbar
          onToggleMobileSidebar={() => {
            if (window.innerWidth <= 768) {
              setIsMobileSidebarOpen(prev => !prev);
            } else {
              setIsSidebarCollapsed(prev => !prev);
            }
          }}
          onOpenAiCopilot={() => setIsAiCopilotOpen(true)}
          onOpenSubscription={() => setIsSubscriptionOpen(true)}
        />

        {/* Scrollable Main Area */}
        <main style={{
          flex: 1,
          padding: '24px',
          overflowY: 'auto',
          position: 'relative'
        }}>
          <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}><Loader2 size={32} color="var(--accent-primary)" style={{ animation: 'spin 1s linear infinite' }} /></div>}>
            {activeCategory === 'converter' ? (
              <ConverterStudioPage />
            ) : activeCategory === 'profile' ? (
              <ProfilePage />
            ) : activeCategory === 'admin' ? (
              <AdminPanelPage />
            ) : (
              <>
                <Breadcrumbs />
                {viewMode === 'grid' ? <FileGrid /> : <FileList />}
              </>
            )}
          </Suspense>
        </main>
      </div>

      {/* Ultra-Premium Floating Modules & Modals */}
      <CommandPalette />
      <ActivityLogDrawer />
      <MediaPlayerBar />
      <BatchActionBar />
      <MobileBottomBar onOpenAiCopilot={() => setIsAiCopilotOpen(true)} />
      <AiCopilotDrawer isOpen={isAiCopilotOpen} onClose={() => setIsAiCopilotOpen(false)} />

      {/* Core Modals */}
      <UploadModal />
      <NewFolderModal />
      <FilePreviewModal />
      <ShareModal />
      <AuthModal />
      {/* Lazy Loaded Studio & Utility Modals */}
      <Suspense fallback={null}>
        <StorageAnalyticsModal />
        {isSubscriptionOpen && <SubscriptionModal isOpen={isSubscriptionOpen} onClose={() => setIsSubscriptionOpen(false)} />}
        <WindowsDriveModal />
      </Suspense>
      <MoveToFolderModal isOpen={Boolean(moveModalTarget)} onClose={() => setMoveModalTarget(null)} targetItemIds={moveModalTarget} />
      <ConfirmDialogModal />
      <ToastContainer />
    </div>
    );
  };

  return (
    <>
      {/* Permanent Global Background Music Engine — Never Unmounts on Route / Auth State */}
      <audio
        ref={globalAudioRef}
        src={currentMusicTrack?.url}
        muted={isMusicMuted}
        loop={isMusicLooping}
        onTimeUpdate={(e) => {
          if (e.target.currentTime > 0) {
            try {
              sessionStorage.setItem('storagebank_music_time', e.target.currentTime.toString());
            } catch {}
          }
        }}
        onEnded={() => { if (!isMusicLooping) setIsMusicPlaying(false); }}
      />
      {renderMainContent()}
    </>
  );
}


export default function App() {
  return (
    <AuthProvider>
      <StorageProvider>
        <AppContent />
      </StorageProvider>
    </AuthProvider>
  );
}
