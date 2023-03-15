import type EventEmitter from "events";

declare module "easy-ftp" {
    interface FtpConfig {
        /** @default "localhost" */
        host?: string;
        /** @default 21 */
        port?: number;
        username: string;
        password: string;
        /** only sftp */
        privateKey?: string;
        /**
         * only ftp
         * @description same as for tls.connect()
         */
        secure?: boolean;
        /** only ftp */
        secureOptions?: boolean;
        type?: "ftp" | "sftp";
    }

    type PathCallback = (err: Error, path: string) => void;
    type ErrCallback = (err: Error) => void;

    interface ProgressData {
        localPath: string;
        remotePath: string;
        transferred: number;
        chunk: number;
        total: number;
    }

    export default class EasyFtp extends EventEmitter {
        connect(config: FtpConfig): void;
        cd(path: string, cb: PathCallback): void;
        pwd(cb: PathCallback): void;
        rm(path: string, cb: ErrCallback): void;
        ls(path: string, cb: (err: Error, list: string[]) => void): void;
        exist(path: string, cb: (exist: boolean) => void): void;
        mkdir(path: string, cb: ErrCallback): void;
        mv(pathFrom: string, pathTo: string, cb: PathCallback): void;
        upload(pathFrom: string, pathTo: string, cb: ErrCallback): void;
        upload(pathFrom: string[], pathTo: string, cb: ErrCallback): void;
        download(remotePath: string, localPath: string, cb: ErrCallback): void;
        download(remotePaths: string[], localPath: string, cb: ErrCallback): void;

        // events
        on(eventName: "open", listener: (client: EasyFtp) => void): this;
        on(eventName: "close", listener: () => void): this;
        on(eventName: "error", listener: (err: Error) => void): this;
        on(eventName: "uploading", listener: (data: ProgressData) => void): this;
        on(
            eventName: "upload",
            listener: (uploadedRemotePath: string) => void
        ): this;
        on(eventName: "downloading", listener: (data: ProgressData) => void): this;
        on(
            eventName: "download",
            listener: (downloadedLocalPath: string) => void
        ): this;
    }
}
