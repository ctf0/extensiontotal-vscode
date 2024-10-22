# 1.3.5

- remove `extensiontotal.apiKeySetting` as we now use vscode secret storage instead of plain key in the settings
- remove `extensiontotal.scanOnlyNewVersions` as we now scan newly installed/updated by default to save api calls
- remove `extensiontotal.scanEveryXHours` as it have no effect, because newly installed/updated extensions are being auto scanned on spot
- auto scan for extensions change is debounced for 5 seconds to avoid rerunning the cmnd multiple times in case multiple extensions being installed ex.when changing profiles or setting up a new environment
- welcome webview now only showup if api key is not set
- when running the manual scan, you will get a modal if you want to scan (all extensions, not previously scanned)
- use esbuild to build ext for smaller size
