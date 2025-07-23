// Constants for folder names
const BAR_ID = "1";
const OTHER_BOOKMARKS_ID = "2";
const BACKUP_FOLDER_NAME = "Bookmark Backup";
const PRIVATE_FOLDER_NAME = "Private Bookmarks";
const WORK_FOLDER_NAME = "Work Bookmarks";

// Helper: Find a folder by name within a parent
async function findFolderByName(parentId, title) {
  const children = await chrome.bookmarks.getChildren(parentId);
  return children.find(child => child.title === title && !child.url);
}

// Initialize and ensure backup folders exist (on startup/install)
async function ensureBackupFoldersExist() {
  let backupFolder = await findFolderByName(OTHER_BOOKMARKS_ID, BACKUP_FOLDER_NAME);
  if (!backupFolder) {
    backupFolder = await chrome.bookmarks.create({
      parentId: OTHER_BOOKMARKS_ID,
      title: BACKUP_FOLDER_NAME
    });
  }

  let privateFolder = await findFolderByName(backupFolder.id, PRIVATE_FOLDER_NAME);
  if (!privateFolder) {
    privateFolder = await chrome.bookmarks.create({
      parentId: backupFolder.id,
      title: PRIVATE_FOLDER_NAME
    });

    // Initial backup: copy current bookmarks bar into Private backup
    await copyBookmarks(BAR_ID, privateFolder.id);
  }

  let workFolder = await findFolderByName(backupFolder.id, WORK_FOLDER_NAME);
  if (!workFolder) {
    await chrome.bookmarks.create({
      parentId: backupFolder.id,
      title: WORK_FOLDER_NAME
    });
    // Work folder starts empty (user manually populates it later)
  }

  // Initialize state if not set
  const {activeFolder} = await chrome.storage.local.get('activeFolder');
  if (!activeFolder) {
    await chrome.storage.local.set({activeFolder: 'private'});
  }
}

// Clear only the bookmarks bar (safe, temporary content)
async function clearBookmarksBar() {
  const items = await chrome.bookmarks.getChildren(BAR_ID);
  for (const item of items) {
    await chrome.bookmarks.removeTree(item.id);
  }
}

// Recursively copy bookmarks/folders safely (no deletion)
async function copyBookmarks(sourceId, destId) {
  const items = await chrome.bookmarks.getChildren(sourceId);
  for (const item of items) {
    const createdItem = await chrome.bookmarks.create({
      parentId: destId,
      title: item.title,
      url: item.url
    });

    if (!item.url) { // If it's a folder, recurse
      await copyBookmarks(item.id, createdItem.id);
    }
  }
}

// Save current bookmarks bar to the active backup folder
async function saveCurrentBookmarksToBackup() {
  try {
    const {activeFolder} = await chrome.storage.local.get('activeFolder');
    if (!activeFolder) return;

    const backupFolder = await findFolderByName(OTHER_BOOKMARKS_ID, BACKUP_FOLDER_NAME);
    if (!backupFolder) return;

    const targetFolderName = activeFolder === 'private' ? PRIVATE_FOLDER_NAME : WORK_FOLDER_NAME;
    const targetFolder = await findFolderByName(backupFolder.id, targetFolderName);
    if (!targetFolder) return;

    // Clear the backup folder first
    const backupItems = await chrome.bookmarks.getChildren(targetFolder.id);
    for (const item of backupItems) {
      await chrome.bookmarks.removeTree(item.id);
    }

    // Copy current bookmarks bar to backup
    await copyBookmarks(BAR_ID, targetFolder.id);
    console.log(`Saved bookmarks to ${targetFolderName}`);
  } catch (error) {
    console.error('Error saving bookmarks to backup:', error);
  }
}

// Toggle bookmarks safely between Work and Private
async function toggleBookmarks() {
  try {
    console.log('Toggle bookmarks triggered');
    
    // First, save current state to backup
    await saveCurrentBookmarksToBackup();

    const {activeFolder} = await chrome.storage.local.get('activeFolder');
    const nextFolder = activeFolder === 'private' ? 'work' : 'private';

    const backupFolder = await findFolderByName(OTHER_BOOKMARKS_ID, BACKUP_FOLDER_NAME);
    const sourceFolderName = nextFolder === 'private' ? PRIVATE_FOLDER_NAME : WORK_FOLDER_NAME;
    const sourceFolder = await findFolderByName(backupFolder.id, sourceFolderName);

    if (!sourceFolder) {
      console.error(`Source folder (${sourceFolderName}) not found.`);
      return;
    }

    await clearBookmarksBar();                       // Safe to delete temp bookmarks
    await copyBookmarks(sourceFolder.id, BAR_ID);    // Safe copying from backup folder

    await chrome.storage.local.set({activeFolder: nextFolder});
    console.log(`Switched to ${nextFolder} bookmarks`);
  } catch (error) {
    console.error('Error toggling bookmarks:', error);
  }
}

// Check if a bookmark change is in the bookmarks bar
function isBookmarkBarChange(id, parentId) {
  return id === BAR_ID || parentId === BAR_ID;
}

// Handle bookmark changes to auto-save to backup
async function handleBookmarkChange() {
  // Add a small delay to avoid saving during our own operations
  setTimeout(async () => {
    await saveCurrentBookmarksToBackup();
  }, 500);
}

// Initialize folders once when installed or extension starts
chrome.runtime.onInstalled.addListener(ensureBackupFoldersExist);
chrome.runtime.onStartup.addListener(ensureBackupFoldersExist);

// Listen for bookmark changes in the bookmarks bar
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  if (isBookmarkBarChange(id, bookmark.parentId)) {
    console.log('Bookmark created in bar, auto-saving...');
    handleBookmarkChange();
  }
});

chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  if (isBookmarkBarChange(id, removeInfo.parentId)) {
    console.log('Bookmark removed from bar, auto-saving...');
    handleBookmarkChange();
  }
});

chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
  // We need to check if this bookmark is in the bookmarks bar
  chrome.bookmarks.get(id).then(bookmarks => {
    if (bookmarks[0] && bookmarks[0].parentId === BAR_ID) {
      console.log('Bookmark changed in bar, auto-saving...');
      handleBookmarkChange();
    }
  }).catch(() => {
    // Bookmark might have been deleted, ignore error
  });
});

chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
  if (isBookmarkBarChange(id, moveInfo.parentId) || isBookmarkBarChange(id, moveInfo.oldParentId)) {
    console.log('Bookmark moved in/out of bar, auto-saving...');
    handleBookmarkChange();
  }
});

// Command and icon click listeners with better error handling
chrome.commands.onCommand.addListener((command) => {
  console.log('Command received:', command);
  if (command === 'toggle-bookmarks') {
    toggleBookmarks();
  }
});

chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked');
  toggleBookmarks();
});
