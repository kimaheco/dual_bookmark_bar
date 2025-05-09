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

// Toggle bookmarks safely between Work and Private
async function toggleBookmarks() {
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
}

// Initialize folders once when installed or extension starts
chrome.runtime.onInstalled.addListener(ensureBackupFoldersExist);
chrome.runtime.onStartup.addListener(ensureBackupFoldersExist);

// Command and icon click listeners
chrome.commands.onCommand.addListener(command => {
  if (command === 'toggle-bookmarks') toggleBookmarks();
});

chrome.action.onClicked.addListener(toggleBookmarks);
