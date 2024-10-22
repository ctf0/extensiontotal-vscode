import vscode from "vscode";

import debounce from 'lodash.debounce';
import { APIKeyManager } from "./ApiKeyManager";
import { OrgIdManager } from "./OrgIdManager";
import { ExtensionResultProvider } from "./Providers/ExtensionResultProvider";
import { WelcomeViewProvider } from "./Providers/WelcomeViewProvider";
import { scanExtensions } from "./scanExtensions";
import * as utils from "./utils";

export async function activate(context: vscode.ExtensionContext) {
  vscode.commands.executeCommand('setContext', 'ext.showWelcomeView', false);

  const orgIdManager = new OrgIdManager(context);
  await orgIdManager.initialize();

  const apiKeyManager = new APIKeyManager(context, orgIdManager.orgId);
  await apiKeyManager.initialize();

  const resultProvider = new ExtensionResultProvider(context);
  const welcomeProvider = new WelcomeViewProvider(context, apiKeyManager);

  if (!apiKeyManager.getApiKey()) {
    noApiKeyFound();
  }

  const scanHandler = async (forceScanAll: boolean = false, waitForInterval: boolean = false) => {
    const currentApiKey: string = apiKeyManager.getApiKey();
    const isOrgMode: boolean = orgIdManager.isOrgMode();

    if (!currentApiKey) {
      return noApiKeyFound();
    }

    if (waitForInterval) {
      const config = utils.getConfig();
      const scanInterval: number = config.get('scanEveryXHours');
      const lastScanKey = 'last-extensiontotal-scan';
      const lastScan = context.globalState.get(lastScanKey, null);
      const now = new Date().getTime();
      const diffInHours = Math.floor(Math.abs((now - lastScan)) / 3600000);

      if (
        scanInterval !== 0 &&
        lastScan &&
        diffInHours < scanInterval
      ) {
        return;
      }

      context.globalState.update(lastScanKey, now);
    }

    await scanExtensions(
      context,
      currentApiKey,
      {
        provider: resultProvider,
        isOrgMode
      },
      forceScanAll
    );
  };

  reloadAccordingToConfig(context, { provider: resultProvider, welcomeProvider }, apiKeyManager);

  vscode.workspace.onDidChangeConfiguration(() => reloadAccordingToConfig(context, { provider: resultProvider, welcomeProvider }, apiKeyManager));

  vscode.extensions.onDidChange(debounce(async () => await scanHandler(false, true), 10 * 1000));

  context.subscriptions.push(
    vscode.commands.registerCommand("ExtensionTotal.scan", async () => {
      const answer = await vscode.window.showInformationMessage(
        "Do you want to scan all installed extensions?",
        { modal: true },
        "Yes", "No (scan new extensions only 'default')"
      )

      if (answer) {
        await scanHandler(answer === 'Yes');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ExtensionTotal.setApiKey", async () => {
      const newApiKey = await vscode.window.showInputBox({
        prompt: "Enter your ExtensionTotal API Key",
        password: true,
      });
      if (newApiKey) {
        await apiKeyManager.setApiKey(newApiKey);
      }
    })
  );

  const config = utils.getConfig();

  if (config.get("scanOnStartup")) {
    scanHandler(false, true);
  }
}

function noApiKeyFound(): void {
  vscode.window.showInformationMessage(
    `📡 ExtensionTotal: No API key found, Please set your API key in the ExtensionTotal panel.`
  );
}

export function deactivate() { }

function reloadAccordingToConfig(context: vscode.ExtensionContext, providers, apiKeyManager: APIKeyManager) {
  const { provider, welcomeProvider } = providers;

  if (!apiKeyManager.getApiKey()) {
    vscode.commands.executeCommand('setContext', 'ext.showWelcomeView', true);

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        "extensiontotal-welcome",
        welcomeProvider
      )
    );
  }

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("extensiontotal-results", provider)
  );

  const options = {
    treeDataProvider: provider,
  };

  const tree = vscode.window.createTreeView("extensiontotal-results", options);
  tree.onDidChangeSelection((e) => {
    const selected: any = e.selection[0];
    vscode.env.openExternal(
      vscode.Uri.parse(
        `https://app.extensiontotal.com/report/${selected.extensionId}`
      )
    );
  });
}
