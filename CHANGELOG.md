# 1.4.0

- remove `extensiontotal.apiKeySetting` as we now use vscode secret storage instead of plain key in the settings
- remove `extensiontotal.scanOnlyNewVersions` as thats the default now to save api calls
- auto scan for extensions change is debounced for 10 seconds to avoid rerunning the cmnd in case multiple extensions being installed ex.(when changing profiles or setting up a new environment)
- welcome webview now only showup if api key is not set
- when running the manual scan, you will get a modal if you want to scan (all extensions, not previously scanned)
- use esbuild to build ext for smaller size
- auto reveal the results panel on scan end
- add support for `400 : extension not found` error with the ability to show the errored extension information
- truncate the extension name in the results view for easier reading
