import {entities as dictionaryEntities, functions as dictionaryService} from '@overturebio-stack/lectern-client';
import {Service} from 'typedi';
import {Logger, LoggerInterface} from '../../decorators/Logger';
import axios, {AxiosResponse} from 'axios';
import {env} from '../../env';
import {Cache, CacheContainer} from 'node-ts-cache';
import {MemoryStorage} from 'node-ts-cache-storage-memory';

const dictionaryCache = new CacheContainer(new MemoryStorage());

@Service()
export class LecternService {

    constructor(
        @Logger(__filename) private log: LoggerInterface
    ) {
    }

    // Do not cache the return from this method
    public async fetchLatestDictionary(name: string): Promise<dictionaryEntities.SchemasDictionary> {
        const token: string = this.getLecternAuthToken();

        const versions: AxiosResponse = await axios.get(`${env.lectern.serverUrl}/dictionaries`, {
            headers: {
                'Authorization': `Basic ${token}`,
            },
        });

        let latestVersion;

        if (versions && versions.data) {
            try {
                latestVersion = versions.data
                        .filter(d => name === d.name)
                        .sort( (a, b) => {
                            if (a.version < b.version) {
                                return -1;
                            }
                            if (a.version > b.version) {
                                return 1;
                            }
                            return 0;
                        })[0]
                        .version;
            } catch (err) {
                throw Error(`No schemas available at ${env.lectern.serverUrl}/dictionaries for dictionary named ${name}`);
            }
        } else {
            throw Error(`No schemas available at ${env.lectern.serverUrl}/dictionaries`);
        }

        return this.fetchDictionary(name, latestVersion);
    }

    @Cache(dictionaryCache, {isCachedForever: true})
    public async fetchDictionary(name: string, version: string): Promise<dictionaryEntities.SchemasDictionary> {
        const token: string = this.getLecternAuthToken();
        const url = `${env.lectern.serverUrl}/dictionaries?version=${version}&name=${name}`;

        const dict = await axios.get(url, {
            headers: {
                'Authorization': `Basic ${token}`,
            },
        });

        return dict.data[0];
    }

    public async validateRecords( schemaName: string,
                                  records: ReadonlyArray<dictionaryEntities.DataRecord>,
                                  schemasDictionary?: dictionaryEntities.SchemasDictionary ): Promise<dictionaryEntities.BatchProcessingResult> {

        if (!schemasDictionary) {
            throw new Error('No schemas provided.');
        }

        try {
            const res = dictionaryService.processRecords(schemasDictionary, schemaName, records);
            return res;
        } catch ( err ) {
            this.log.error(err);
            throw err;
        }
    }

    private getLecternAuthToken(): string {
        const token = Buffer
            .from(`${env.lectern.username}:${env.lectern.password}`, 'utf8')
            .toString('base64');
        return token;
    }
}
