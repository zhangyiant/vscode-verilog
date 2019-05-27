import { window, ExtensionContext } from 'vscode';

export function activate(context: ExtensionContext) {
    window.showErrorMessage("Hello World!");
}