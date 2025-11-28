# OnlySort
## 🧹 Nothing but bare sorting.

OnlySort is a simple, fast, and privacy-focused browser extension designed to eliminate tab clutter by automatically sorting your open tabs. Get organized in just one click!

### ✨ Features

* **One-Click Sorting:** Quickly sort all tabs in the current window or across all open windows.
* **Logical Ordering:** Tabs are sorted based on a sensible, tiered sequence:
    1.  **Domain** (e.g., all `google.com` tabs grouped together)
    2.  **Subdomain** (e.g., separating `mail.google.com` from `docs.google.com`)
    3.  **Title** (alphabetical sorting for tabs from the same subdomain)
* **Privacy First:** No data is collected, stored, or transmitted. It just sorts your tabs—that's it.

### ⬇️ Installation

#### 💻 Option 1: Install from the Chrome Web Store

The easiest way to install OnlySort is directly from the official store:

1.  [**Click here to visit the Chrome Web Store page.**](https://chromewebstore.google.com/detail/onlysort/jbofkmdfgjjnabnbemnjjegakmidemkj)
2.  Click the **"Add to Chrome"** button.
3.  Pin the extension icon for easy access!

#### 🛠️ Option 2: Manual Installation (Developer Use)

If you are installing from a local copy or developing:

1.  Clone this repository:
2.  Open your browser's extensions page (e.g., `chrome://extensions`).
3.  Enable **Developer mode** using the toggle in the top-right corner.
4.  Click **"Load unpacked"** and select the `src` extension directory inside this repo.

### 📦 Development & Packaging

This section is for developers looking to build, test, or package the extension.

#### Manual Installation for Testing

Follow **Option 2** in the Installation guide above.

#### Packaging for Chrome Web Store Submission

To generate the packaged `.zip` file ready for submission to the Chrome Web Store, use the provided build script:

```bash
./build.sh pack ext-onlySort
