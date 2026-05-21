declare module 'y-websocket/bin/utils' {
  export function setupWSConnection(conn: any, req: any, options?: any): void;
  export function setPersistence(opt: {
    bindState: (docName: string, ydoc: any) => Promise<void>;
    writeState: (docName: string, ydoc: any) => Promise<void>;
  }): void;
}

declare module 'y-leveldb' {
  export class LeveldbPersistence {
    constructor(location: string, options?: any);
    getYDoc(docName: string): Promise<any>;
    storeUpdate(docName: string, update: Uint8Array): Promise<void>;
    clearDocument(docName: string): Promise<void>;
    flushDocument(docName: string): Promise<void>;
    destroy(): Promise<void>;
  }
}
