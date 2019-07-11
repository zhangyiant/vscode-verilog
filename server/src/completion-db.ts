import { keywords } from './keywords';
import { CompletionItemKind } from 'vscode-languageserver';
import * as _ from 'lodash';


interface CompletionDbItem {
    text: string;
    kind: CompletionItemKind;
    detail: string;
    documentation: string;
    identifier: string;
}

class CompletionDb {

    items: CompletionDbItem[];

    constructor() {
        this.items = [];
        this.loadKeywords();
        return;
    }

    loadKeywords(): void {
        for (let keyword of keywords) {
            let item: CompletionDbItem = {
                text: keyword,
                kind: CompletionItemKind.Keyword,
                detail: "Keyword: " + keyword,
                documentation: "Keyword: " + keyword,
                identifier: "keyword-" + keyword
            }
            this.items.push(item);
        }
        return;
    }

    addCompletionDbItem(item: CompletionDbItem):void {
        this.items.push(item);
    }

    deleteCompletionDbItem(identifier:string): void {
        _.remove(this.items, function (n: CompletionDbItem) {
            return n.identifier === identifier;
        });
        return;
    }

    updateCompletionDbItem(item: CompletionDbItem): void {
        let myItem: CompletionDbItem | undefined;
        myItem = _.find(this.items, function(o: CompletionDbItem) {
            return o.identifier === item.identifier;
        });
        if (myItem) {
            myItem.text = item.text;
            myItem.kind = item.kind;
            myItem.detail = item.detail;
            myItem.documentation = item.documentation;
        } else {
            this.addCompletionDbItem(item);
        }
        return;
    }

    getItem(identifier: string): CompletionDbItem | undefined {
        return _.find(this.items, function(o: CompletionDbItem) {
            return o.identifier === identifier;
        });
    }

    getItems(firstCharacter: string): CompletionDbItem[] {
        let items = [];
        for (let item of this.items) {
            if (item.text.charAt(0) === firstCharacter) {
                items.push(item);
            }
        }
        return items;
    }
}

let completionDb = new CompletionDb();
export { completionDb };
export { CompletionDb, CompletionDbItem };
