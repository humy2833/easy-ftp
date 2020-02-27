declare module "easy-ftp" {

    interface FtpConfig {
        host?: string, // default lovalhost
        port?: number | 21,
        username: string,
        password: string,
        privateKey?: string, // (only sftp)
        secure?: boolean, // (only ftp) same as for tls.connect()
        secureOptions?: boolean, // (only ftp)
        type?: 'ftp' | 'sftp'
    }

    type PathCallback = (err: Error, path: string) => void
    type ErrCallback = (err: Error) => void


    export default class EasyFtp {
        connect(config: FtpConfig): void
        cd(path: string, cb: PathCallback): void
        pwd(cb: PathCallback): void
        rm(path: string, cb: ErrCallback): void
        ls(path: string, cb: (err: Error, lsit: string[]) => void): void
        exist(path: string, cb: (exist: boolean) => void): void
        mkdir(path: string, cb: ErrCallback): void
        mv(pathFrom: string, pathTo: string, cb: PathCallback): void
        upload(pathFrom: string, pathTo: string, cb: ErrCallback): void
    }
}