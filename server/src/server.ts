import {
	createConnection,
	TextDocuments,
	TextDocument,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	CompletionParams,
	Position,
	Range
} from 'vscode-languageserver';
import { completionDb, CompletionDbItem } from './completion-db';
import { parse } from '@zhangyiant/antlr-verilog-lsp-parser';

let connection = createConnection(ProposedFeatures.all);

let documents: TextDocuments = new TextDocuments();

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;
let moduleIdentifier: string | null = null;

connection.onInitialize((params: InitializeParams) => {
	let capabilities = params.capabilities;

	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	return {
		capabilities: {
			textDocumentSync: documents.syncKind,
			completionProvider: {
				resolveProvider: true
			}
		}
	};
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}


const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

let documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <ExampleSettings>(
			(change.settings.languageServerExample || defaultSettings)
		);
	}

	// Revalidate all open text documents
	documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'languageServerExample'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	// In this simple example we get the settings for every validate run.
	let settings = await getDocumentSettings(textDocument.uri);

	// The validator creates diagnostics for all uppercase words length 2 and more
	let text = textDocument.getText();
	let pattern = /\b[A-Z]{2,}\b/g;
	let m: RegExpExecArray | null;

	let problems = 0;
	let diagnostics: Diagnostic[] = [];
	while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
		problems++;
		let diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Warning,
			range: {
				start: textDocument.positionAt(m.index),
				end: textDocument.positionAt(m.index + m[0].length)
			},
			message: `${m[0]} is all uppercase.`,
			source: 'ex'
		};
		if (hasDiagnosticRelatedInformationCapability) {
			diagnostic.relatedInformation = [
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnostic.range)
					},
					message: 'Spelling matters'
				},
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnostic.range)
					},
					message: 'Particularly for names'
				}
			];
		}
		diagnostics.push(diagnostic);
	}

	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

function parseDocument(document: TextDocument):void {
	let parseResult = parse(document.getText());
	if (parseResult.hasOwnProperty("module_name")) {
		moduleIdentifier = parseResult["module_name"];
		if (moduleIdentifier) {
			let item: CompletionDbItem = {
				text: moduleIdentifier,
				kind: CompletionItemKind.Module,
				detail: "Module: " + moduleIdentifier,
				documentation: "Module: " + moduleIdentifier,
				identifier: "module-" + moduleIdentifier
			};
			completionDb.updateCompletionDbItem(item);
		}
	}
	if (parseResult.hasOwnProperty("list_of_ports")) {
		let ports = parseResult["list_of_ports"];
		for (let port of ports) {
			let item: CompletionDbItem = {
				text: port,
				kind: CompletionItemKind.Variable,
				detail: "Port: " + port,
				documentation: "Port: " + port,
				identifier: "port-" + port
			}
			completionDb.updateCompletionDbItem(item);
		}
	}
	return;
}

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(completionParams: CompletionParams): CompletionItem[] => {
		let document: TextDocument | undefined = documents.get(completionParams.textDocument.uri);
		let position: Position = completionParams.position;
		let line: number = position.line;
		let character: number = position.character;
		if (document) {
			parseDocument(document);
			if (character > 0) {
				let lastCharacterPosition: Position = {
					line: position.line,
					character: position.character - 1
				}
				let lastCharacterRange: Range = {
					start: lastCharacterPosition,
					end: position
				}
				let lastCharacter = document.getText(lastCharacterRange);
				let completionItems: CompletionItem[] = [];
				let items: CompletionDbItem[] = completionDb.getItems(lastCharacter);
				for (let item of items) {
					let completionItem: CompletionItem = {
						'label': item.text,
						kind: item.kind,
						textEdit: {
							range: {
								start: lastCharacterPosition,
								end: position
							},
							newText: item.text
						},
						data: {
							identifier: item.identifier
						}
					};
					completionItems.push(completionItem);
				}
				return completionItems;
			} else {
				return [];
			}
		}
		return [];
	}
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		let dbItem: CompletionDbItem | undefined = completionDb.getItem(item.data.identifier);
		if (dbItem) {
			item.detail = dbItem.detail,
			item.documentation = dbItem.documentation;
		}
		return item;
	}
);


documents.listen(connection);


connection.listen();
