# 🔖 Dual Bookmark Bar

Easily toggle between **Private** and **Work** bookmark bars with a single click or keyboard shortcut.

This lightweight Chrome extension creates a backup of your current bookmarks and allows you to switch between two distinct sets — great for keeping your personal and professional lives organized.

---

## 🚀 Features

- Automatically creates backup folders on first use
- Keeps separate sets of bookmarks: **Private** and **Work**
- Safely clears and restores the bookmarks bar without deleting anything permanently
- Toggle via:
  - Toolbar icon
  - Keyboard shortcut (default: `Alt + Shift + Y`)

---

## 🛠 Installation

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the folder you cloned.
5. The extension icon will appear in your toolbar.

---

## 📁 Folder Structure

- `Private Bookmarks`: your original bookmarks, backed up at first use.
- `Work Bookmarks`: starts empty — add your work-related bookmarks here manually.
- All backups are stored under `Other Bookmarks > Bookmark Backup`.

---

## 📌 Permissions

- `bookmarks`: to read, modify, and backup your bookmarks.
- `storage`: to remember your active state (Private vs. Work).
- `commands`: to enable the keyboard shortcut.

---

## 🧪 Development

No build tools required. Just edit and reload the extension in `chrome://extensions/`.

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE). Contributions are welcome!

---

## 🤖 Crafted with ChatGPT

💡 Created by [kimaheco](https://github.com/kimaheco) — crafted with help from ChatGPT
