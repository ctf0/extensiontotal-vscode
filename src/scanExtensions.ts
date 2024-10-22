import vscode from "vscode";
import os from "os";

import { sleep, sendHttpsRequest } from "./utils";
import { ExtensionResultProvider } from "./Providers/ExtensionResultProvider";

export async function scanExtensions(
  context: vscode.ExtensionContext,
  apiKey: string,
  config: {
    provider: ExtensionResultProvider;
    isOrgMode: boolean;
  },
  forceScanAll: boolean
) {
  const { provider, isOrgMode } = config;

  let extensions: vscode.Extension<any>[] = vscode.extensions.all.filter(
    (extension: vscode.Extension<any>) => !extension.id.startsWith("vscode.")
  );

  if (!forceScanAll) {
    extensions = extensions.filter((extension: vscode.Extension<any>) => {
      const lastVersion = context.globalState.get(
        `scanned-${extension.id}`,
        null
      );

      return lastVersion !== extension.packageJSON.version
    });
  }

  let foundHigh = false;
  let limitReached = false;
  let invalidApiKey = false;

  const extLength = extensions.length;

  if (extLength === 0) {
    return;
  }

  const progressOptions: vscode.ProgressOptions = {
    location: vscode.ProgressLocation.Notification,
    title: `📡 ExtensionTotal: Running scan on ${extLength} extensions...`,
    cancellable: true,
  };

  await vscode.window.withProgress(progressOptions, async (progress, token) => {
    provider.refresh(true);
    let forceStop = false;
    token.onCancellationRequested(() => {
      forceStop = true;
    });
    const incrementBy = 100 / extLength;

    for (
      let index = 0;
      index < extLength && !forceStop && !invalidApiKey;
      index++
    ) {
      const extension = extensions[index];

      progress.report({ increment: incrementBy });

      const requestBody = {
        q: extension.id,
        orgData: getOrgData(isOrgMode),
      };
      const requestOptions = {
        host: "app.extensiontotal.com",
        port: "443",
        path: "/api/getExtensionRisk",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Origin": "Extension",
          ...(apiKey ? { "X-API-Key": apiKey } : {}),
        },
      };
      const scanResult = await sendHttpsRequest(requestOptions, requestBody);

      const scanStatusFlags = handleExtensionScanResult(
        extension,
        scanResult,
        context,
        provider
      );
      limitReached = !!scanStatusFlags.limitReached;
      invalidApiKey = !!scanStatusFlags.invalidApiKey;
      foundHigh = !!scanStatusFlags.foundHigh;

      if (limitReached || invalidApiKey) {
        break;
      }

      await sleep(1000);
    }
  });

  if (invalidApiKey) {
    vscode.window.showErrorMessage(
      `📡 ExtensionTotal: Scan aborted due to invalid API key. Please re-enter your API key in the ExtensionTotal panel.`
    );
  } else if (foundHigh) {
    vscode.window.showInformationMessage(
      `📡 ExtensionTotal: Finished scan with high risk findings 🚨 Please review results in the ExtensionTotal pane.`
    );
  } else {
    vscode.window.showInformationMessage(
      `📡 ExtensionTotal: Finished scan with no high risk findings. Review results in the ExtensionTotal pane.`
    );
  }

  if (!invalidApiKey) {
    vscode.commands.executeCommand("extensiontotal-results.focus")
  }
}

function handleExtensionScanResult(
  extension: vscode.Extension<any>,
  scanResult: any,
  context: vscode.ExtensionContext,
  provider: ExtensionResultProvider
): { limitReached?: boolean; foundHigh?: boolean; invalidApiKey?: boolean } {
  const { statusCode, data, error } = scanResult;

  if (error) {
    vscode.window.showErrorMessage(`📡 ExtensionTotal: ${error.toString()}`);
    return {};
  } else if (statusCode == 400) {
    const name = extension.packageJSON.displayName || extension.packageJSON.name

    vscode.window.showErrorMessage(
      `📡 ExtensionTotal: (${name}) cant be scanned atm, try again later`,
      'show extension info'
    ).then((answer) => {
      if (answer) {
        vscode.commands.executeCommand('workbench.extensions.search', `@installed ${name}`);
      }
    });

    return {};
  } else if (statusCode === 429) {
    vscode.window.showInformationMessage(
      `📡 ExtensionTotal: Free rate limit reached, visit https://app.extensiontotal.com/sponsor for an API key`
    );
    return { limitReached: true };
  } else if (statusCode === 403 || data === "Invalid API key") {
    return { invalidApiKey: true };
  } else {
    const foundHigh = handleSuccessfulExtensionScanResult(
      extension,
      data,
      context,
      provider
    );
    return { foundHigh };
  }
}

function handleSuccessfulExtensionScanResult(
  extension: vscode.Extension<any>,
  scanData: any,
  context: vscode.ExtensionContext,
  provider: ExtensionResultProvider
) {
  try {
    const extensionData = JSON.parse(scanData);
    context.globalState.update(
      `scanned-${extension.id}`,
      extension.packageJSON.version
    );
    provider.addResult(
      extension.id,
      extensionData.display_name,
      extensionData.riskLabel,
      extensionData.risk
    );
    provider.refresh();

    const foundHigh = alertHighRiskExtensionIfNeeded(
      extension.id,
      extensionData,
      context
    );
    return foundHigh;
  } catch (error) {
    console.error(error.message);
  }
}

function alertHighRiskExtensionIfNeeded(
  extensionId: string,
  extensionData: any,
  context: vscode.ExtensionContext
): boolean {
  if (extensionData.risk >= 7) {
    let lastTagged = context.globalState.get(`alerted-${extensionId}`, "no");
    if (lastTagged === "yes") {
      return false;
    }

    vscode.window.showInformationMessage(
      `🚨 High Risk Extension Found: ${extensionData.display_name}`,
      {
        modal: true,
        detail: `ExtensionTotal found a new high risk extension "${
          extensionData.display_name || extensionData.name
        }" installed on your machine.\n\n
        Consider reviewing the ExtensionTotal report: https://app.extensiontotal/report/${extensionId}\n\n
        Once confirming this message, we will no longer alert you on this extension.`,
      }
    );
    context.globalState.update(`alerted-${extensionId}`, "yes");
    return true;
  }
  return false;
}

function getOrgData(
  isOrgMode: boolean
): { hostname: string; username: string } | undefined {
  if (!isOrgMode) {
    return;
  }
  return { hostname: os.hostname(), username: os.userInfo().username };
}
