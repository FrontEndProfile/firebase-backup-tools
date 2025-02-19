class BackupService {
    constructor() {
        this.firestoreData = {};
        this.storageFiles = [];
        this.totalItems = 0;
        this.processedItems = 0;
    }

    async startBackup(includeFirestore, includeStorage, progressCallback) {
        this.processedItems = 0;
        this.totalItems = 0;

        try {
            if (includeFirestore) {
                await this.backupFirestore(progressCallback);
            }
            
            if (includeStorage) {
                await this.backupStorage(progressCallback);
            }

            await this.createBackupZip();
            progressCallback('Backup completed successfully!', 100);
        } catch (error) {
            console.error('Backup error:', error);
            progressCallback(`Error: ${error.message}`, 0);
        }
    }

    async backupFirestore(progressCallback) {
        const collections = await firebaseConfig.db.listCollections();
        
        for (const collection of collections) {
            progressCallback(`Processing collection: ${collection.id}`, this.calculateProgress());
            
            const snapshot = await collection.get();
            this.firestoreData[collection.id] = [];
            
            snapshot.forEach(doc => {
                this.firestoreData[collection.id].push({
                    id: doc.id,
                    data: doc.data()
                });
                this.processedItems++;
            });
        }
    }

    async backupStorage(progressCallback) {
        const storageRef = firebaseConfig.storage.ref();
        
        try {
            const items = await storageRef.listAll();
            this.totalItems += items.items.length;

            for (const item of items.items) {
                progressCallback(`Downloading: ${item.fullPath}`, this.calculateProgress());
                
                const url = await item.getDownloadURL();
                const metadata = await item.getMetadata();
                
                this.storageFiles.push({
                    path: item.fullPath,
                    url: url,
                    metadata: metadata
                });
                
                this.processedItems++;
            }
        } catch (error) {
            console.error('Storage backup error:', error);
            throw error;
        }
    }

    async createBackupZip() {
        const backup = {
            timestamp: new Date().toISOString(),
            firestore: this.firestoreData,
            storage: this.storageFiles
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], 
            {type: 'application/json'});
        saveAs(blob, `firebase-backup-${new Date().toISOString()}.json`);
    }

    calculateProgress() {
        return this.totalItems === 0 ? 0 : 
            Math.round((this.processedItems / this.totalItems) * 100);
    }
}

const backupService = new BackupService();
