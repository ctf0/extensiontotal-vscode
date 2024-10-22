import vscode from "vscode";

import debounce from 'lodash.debounce';
import { APIKeyManager } from "./ApiKeyManager";
import { OrgIdManager } from "./OrgIdManager";
import { ExtensionResultProvider } from "./Providers/ExtensionResultProvider";
import { WelcomeViewProvider } from "./Providers/WelcomeViewProvider";
import { scanExtensions } from "./scanExtensions";

export async function activate(context: vscode.ExtensionContext) {
  vscode.commands.executeCommand('setContext', 'ext.showWelcomeView', false);

  const orgIdManager = new OrgIdManager(context);
  await orgIdManager.initialize();

  const apiKeyManager = new APIKeyManager(context, orgIdManager.orgId);
  await apiKeyManager.initialize();

  const provider = new ExtensionResultProvider(context);
  const welcomeProvider = new WelcomeViewProvider(context, apiKeyManager);

  if (!apiKeyManager.getApiKey()) {
    noApiKeyFound();
  }

  const scanHandler = async (forceScanAll: boolean = false) => {
    const currentApiKey: string = apiKeyManager.getApiKey();
    const isOrgMode: boolean = orgIdManager.isOrgMode()

    if (!currentApiKey) {
      return noApiKeyFound();
    }

    await scanExtensions(
      context,
      currentApiKey,
      {
        provider,
        isOrgMode
      },
      forceScanAll
    );
  };

  reloadAccordingToConfig(context, { provider, welcomeProvider }, apiKeyManager);

  vscode.workspace.onDidChangeConfiguration(() => reloadAccordingToConfig(context, { provider, welcomeProvider }, apiKeyManager));

  vscode.extensions.onDidChange(
    debounce(async (e) => await scanHandler(), 50 * 1000),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ExtensionTotal.scan", async () => {
      const answer = await vscode.window.showInformationMessage(
        "Do you want to scan all installed extensions?",
        { modal: true },
        "Yes", "Non scanned only (default)"
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

  const config = vscode.workspace.getConfiguration("extensiontotal");
  const scanOnStartup = config.get("scanOnStartup");

  if (scanOnStartup) {
    scanHandler();
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
