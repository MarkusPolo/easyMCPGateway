import { ChromaClient, Collection } from "chromadb";
import * as path from "path";
import * as fs from "fs";

export class MemoryService {
    private client: ChromaClient;
    private collections: Map<string, Collection> = new Map();
    private dbPath: string;

    constructor() {
        this.dbPath = path.resolve(process.cwd(), "data", "chroma");
        if (!fs.existsSync(this.dbPath)) {
            fs.mkdirSync(this.dbPath, { recursive: true });
        }

        // ChromaClient by default expects a server running at localhost:8000
        // To use local persistence without a server, ChromaDB requires a different setup (PersistentClient)
        // which might not be fully supported in all JS environments without a backend.
        this.client = new ChromaClient({
            host: "localhost",
            port: 8000
        });
    }

    private async hasServer(): Promise<boolean> {
        try {
            await this.client.heartbeat();
            return true;
        } catch (e: any) {
            console.error("ChromaDB Heartbeat failed:", e.message);
            return false;
        }
    }

    private async getCollection(profileId: string): Promise<Collection> {
        const collectionName = `memory_profile_${profileId.replace(/-/g, '_')}`;

        if (!(await this.hasServer())) {
            console.error("ChromaDB server is not running. Cannot access collection.");
            throw new Error("ChromaDB server not available.");
        }

        if (this.collections.has(collectionName)) {
            return this.collections.get(collectionName)!;
        }

        try {
            const collection = await this.client.getOrCreateCollection({
                name: collectionName,
                metadata: { "profile_id": profileId }
            });
            this.collections.set(collectionName, collection);
            return collection;
        } catch (error) {
            console.error(`Error getting/creating collection for profile ${profileId}:`, error);
            throw error;
        }
    }

    public async store(profileId: string, text: string, metadata: Record<string, any> = {}): Promise<void> {
        const collection = await this.getCollection(profileId);
        const id = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        await collection.add({
            ids: [id],
            metadatas: [metadata],
            documents: [text]
        });
    }

    public async query(profileId: string, queryText: string, limit: number = 5): Promise<Array<{ text: string; metadata: any; distance: number }>> {
        const collection = await this.getCollection(profileId);

        const results = await collection.query({
            queryTexts: [queryText],
            nResults: limit
        });

        const formattedResults: Array<{ text: string; metadata: any; distance: number }> = [];

        if (results.documents[0]) {
            for (let i = 0; i < results.documents[0].length; i++) {
                formattedResults.push({
                    text: results.documents[0][i] as string,
                    metadata: results.metadatas[0][i],
                    distance: (results.distances && results.distances[0]) ? (results.distances[0][i] ?? 0) : 0
                });
            }
        }

        return formattedResults;
    }
}

export const memoryService = new MemoryService();
