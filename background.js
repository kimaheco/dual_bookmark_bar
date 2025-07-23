/**
 * Dual Bookmark Bar Extension
 * Simple, reliable bookmark switching between Private and Work sets
 */

// Configuration
const CONFIG = {
  BOOKMARKS_BAR_ID: "1",
  STORAGE_FOLDER_NAME: "📁 Dual Bookmarks Storage",
  PRIVATE_FOLDER_NAME: "🏠 Private Bookmarks", 
  WORK_FOLDER_NAME: "💼 Work Bookmarks",
  CURRENT_MODE_KEY: "currentMode",
  INITIALIZED_KEY: "extensionInitialized"
};

// Global state
let isOperationInProgress = false;
let storageParentId = null;

/**
 * Find a suitable parent folder for our storage (Other Bookmarks)
 */
async function findStorageParent() {
  try {
    const tree = await chrome.bookmarks.getTree();
    const root = tree[0];
    
    // Look for "Other Bookmarks" or similar folder
    for (const child of root.children) {
      if (!child.url && child.id !== CONFIG.BOOKMARKS_BAR_ID) {
        console.log(`Found storage parent: ${child.title} (ID: ${child.id})`);
        return child.id;
      }
    }
    
    throw new Error("Could not find suitable parent folder");
  } catch (error) {
    console.error("Error finding storage parent:", error);
    return null;
  }
}

/**
 * Find or create a folder by name within a parent
 */
async function ensureFolder(parentId, folderName) {
  try {
    const children = await chrome.bookmarks.getChildren(parentId);
    const existing = children.find(child => child.title === folderName && !child.url);
    
    if (existing) {
      console.log(`Found existing folder: ${folderName}`);
      return existing;
    }
    
    console.log(`Creating folder: ${folderName}`);
    return await chrome.bookmarks.create({
      parentId: parentId,
      title: folderName
    });
  } catch (error) {
    console.error(`Error ensuring folder ${folderName}:`, error);
    return null;
  }
}

/**
 * Recursively copy bookmarks from source to destination
 */
async function copyBookmarks(sourceId, destId, clearDestFirst = false) {
  try {
    if (clearDestFirst) {
      const existing = await chrome.bookmarks.getChildren(destId);
      for (const item of existing) {
        await chrome.bookmarks.removeTree(item.id);
      }
    }
    
    const items = await chrome.bookmarks.getChildren(sourceId);
    
    for (const item of items) {
      const newItem = await chrome.bookmarks.create({
        parentId: destId,
        title: item.title,
        url: item.url // undefined for folders
      });
      
      // If it's a folder, recursively copy its contents
      if (!item.url) {
        await copyBookmarks(item.id, newItem.id);
      }
    }
    
    console.log(`Successfully copied bookmarks from ${sourceId} to ${destId}`);
  } catch (error) {
    console.error(`Error copying bookmarks: ${error.message}`);
    throw error;
  }
}

/**
 * Initialize the extension - set up storage folders and save existing bookmarks
 */
async function initializeExtension() {
  try {
    console.log("Initializing Dual Bookmark Extension...");
    
    // Check if already initialized
    const result = await chrome.storage.local.get(CONFIG.INITIALIZED_KEY);
    if (result[CONFIG.INITIALIZED_KEY]) {
      console.log("Extension already initialized");
      await loadStorageParent();
      return;
    }
    
    // Find storage parent
    storageParentId = await findStorageParent();
    if (!storageParentId) {
      throw new Error("Cannot find suitable storage location");
    }
    
    // Create main storage folder
    const storageFolder = await ensureFolder(storageParentId, CONFIG.STORAGE_FOLDER_NAME);
    if (!storageFolder) {
      throw new Error("Cannot create storage folder");
    }
    
    // Create Private and Work folders
    const privateFolder = await ensureFolder(storageFolder.id, CONFIG.PRIVATE_FOLDER_NAME);
    const workFolder = await ensureFolder(storageFolder.id, CONFIG.WORK_FOLDER_NAME);
    
    if (!privateFolder || !workFolder) {
      throw new Error("Cannot create bookmark folders");
    }
    
    // Save current bookmarks bar content to Private folder (initial backup)
    console.log("Backing up existing bookmarks to Private folder...");
    await copyBookmarks(CONFIG.BOOKMARKS_BAR_ID, privateFolder.id);
    
    // Set initial mode to Private
    await chrome.storage.local.set({
      [CONFIG.CURRENT_MODE_KEY]: "private",
      [CONFIG.INITIALIZED_KEY]: true,
      storageParentId: storageParentId,
      storageFolderId: storageFolder.id,
      privateFolderId: privateFolder.id,
      workFolderId: workFolder.id
    });
    
    console.log("Extension initialization complete!");
    
  } catch (error) {
    console.error("Failed to initialize extension:", error);
  }
}

/**
 * Load storage parent ID from saved data
 */
async function loadStorageParent() {
  const result = await chrome.storage.local.get("storageParentId");
  storageParentId = result.storageParentId;
}

/**
 * Get the folder IDs for Private and Work bookmarks
 */
async function getFolderIds() {
  const result = await chrome.storage.local.get(["privateFolderId", "workFolderId"]);
  return {
    privateId: result.privateFolderId,
    workId: result.workFolderId
  };
}

/**
 * Save current bookmarks bar to the active folder
 */
async function saveCurrentBookmarks() {
  if (isOperationInProgress) {
    console.log("Operation in progress, skipping auto-save");
    return;
  }
  
  try {
    const result = await chrome.storage.local.get(CONFIG.CURRENT_MODE_KEY);
    const currentMode = result[CONFIG.CURRENT_MODE_KEY] || "private";
    
    const { privateId, workId } = await getFolderIds();
    const targetId = currentMode === "private" ? privateId : workId;
    
    if (!targetId) {
      console.error("Target folder not found");
      return;
    }
    
    console.log(`Auto-saving bookmarks to ${currentMode} folder...`);
    await copyBookmarks(CONFIG.BOOKMARKS_BAR_ID, targetId, true);
    console.log("Auto-save complete");
    
  } catch (error) {
    console.error("Error auto-saving bookmarks:", error);
  }
}

/**
 * Toggle between Private and Work bookmark sets
 */
async function toggleBookmarks() {
  if (isOperationInProgress) {
    console.log("Toggle already in progress");
    return;
  }
  
  try {
    isOperationInProgress = true;
    console.log("Starting bookmark toggle...");
    
    // Get current mode
    const result = await chrome.storage.local.get(CONFIG.CURRENT_MODE_KEY);
    const currentMode = result[CONFIG.CURRENT_MODE_KEY] || "private";
    const newMode = currentMode === "private" ? "work" : "private";
    
    // Save current bookmarks first
    await saveCurrentBookmarks();
    
    // Get folder IDs
    const { privateId, workId } = await getFolderIds();
    const sourceId = newMode === "private" ? privateId : workId;
    
    if (!sourceId) {
      throw new Error(`${newMode} folder not found`);
    }
    
    // Clear current bookmarks bar and load new set
    console.log(`Switching to ${newMode} bookmarks...`);
    await copyBookmarks(sourceId, CONFIG.BOOKMARKS_BAR_ID, true);
    
    // Update mode
    await chrome.storage.local.set({ [CONFIG.CURRENT_MODE_KEY]: newMode });
    
    console.log(`Successfully switched to ${newMode} mode`);
    
  } catch (error) {
    console.error("Error toggling bookmarks:", error);
  } finally {
    // Re-enable operations after a delay
    setTimeout(() => {
      isOperationInProgress = false;
      console.log("Operations re-enabled");
    }, 1000);
  }
}

/**
 * Check if a bookmark change affects the bookmarks bar
 */
function isBookmarksBarChange(bookmarkId, parentId) {
  return bookmarkId === CONFIG.BOOKMARKS_BAR_ID || parentId === CONFIG.BOOKMARKS_BAR_ID;
}

/**
 * Handle bookmark changes with debouncing
 */
let saveTimeout = null;
function handleBookmarkChange(eventType) {
  console.log(`Bookmark ${eventType} detected`);
  
  // Clear existing timeout
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  // Set new timeout for auto-save
  saveTimeout = setTimeout(() => {
    saveCurrentBookmarks();
  }, 1000); // 1 second delay to avoid excessive saves
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

// Initialize on install/startup
chrome.runtime.onInstalled.addListener(initializeExtension);
chrome.runtime.onStartup.addListener(async () => {
  await loadStorageParent();
});

// Bookmark change listeners
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  if (isBookmarksBarChange(id, bookmark.parentId)) {
    handleBookmarkChange("created");
  }
});

chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  if (isBookmarksBarChange(id, removeInfo.parentId)) {
    handleBookmarkChange("removed");
  }
});

chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  try {
    const bookmark = await chrome.bookmarks.get(id);
    if (bookmark[0] && bookmark[0].parentId === CONFIG.BOOKMARKS_BAR_ID) {
      handleBookmarkChange("changed");
    }
  } catch (error) {
    // Bookmark might not exist anymore, ignore
  }
});

chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
  if (isBookmarksBarChange(id, moveInfo.parentId) || 
      isBookmarksBarChange(id, moveInfo.oldParentId)) {
    handleBookmarkChange("moved");
  }
});

// Extension icon click
chrome.action.onClicked.addListener(() => {
  console.log("Extension icon clicked");
  toggleBookmarks();
});

// Keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-bookmarks") {
    console.log("Keyboard shortcut triggered");
    toggleBookmarks();
  }
});

console.log("Dual Bookmark Extension loaded");
