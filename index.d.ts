declare module "easy-ftp" {

    interface FtpConfig {
        host: string,
        port: number | 21,
        username: string,
        password: string,
        type: 'ftp' | 'sftp'
    }

    type PathCallback = (err: Error, path: string) => void
    type ErrCallback = (err: Error) => void


    export default class EasyFtp {
        connect(config: FtpConfig) : void
        cd(path: string, cb: PathCallback)
        pwd(cb: PathCallback)
        rm(path: string, cb: ErrCallback)
        ls(path: string, cb: (err: Error, lsit: string[]) => void)
        exist(path: string, cb: (exist: boolean) => void)
        mkdir(path: string, cb: ErrCallback)
        mv(pathFrom: string, pathTo: string, cb: PathCallback)
        upload(pathFrom: string, pathTo: string, cb: ErrCallback)
    }
}