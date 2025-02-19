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
        this.firestoreData = {};
        this.storageFiles = [];

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
            throw error;
        }
    }

    async backupFirestore(progressCallback) {
        try {
            // List of collections to backup
            const collections = ['products', 'blogs', 'gallery'];
            this.totalItems += collections.length;

            for (const collectionName of collections) {
                progressCallback(`Processing collection: ${collectionName}`, this.calculateProgress());

                try {
                    const collectionRef = firebaseConfig.db.collection(collectionName);
                    const snapshot = await collectionRef.get();
                    this.firestoreData[collectionName] = [];

                    snapshot.forEach(doc => {
                        this.firestoreData[collectionName].push({
                            id: doc.id,
                            data: doc.data()
                        });
                    });
                    this.processedItems++;
                } catch (collectionError) {
                    console.warn(`Collection ${collectionName} not found or error:`, collectionError);
                    // Continue with next collection even if one fails
                }
            }
        } catch (error) {
            console.error('Firestore backup error:', error);
            throw error;
        }
    }

    async backupStorage(progressCallback) {
        const storageRef = firebaseConfig.storage.ref();

        try {
            const items = await storageRef.listAll();
            this.totalItems += items.items.length;

            for (const item of items.items) {
                progressCallback(`Downloading: ${item.fullPath}`, this.calculateProgress());

                try {
                    const url = await item.getDownloadURL();
                    const metadata = await item.getMetadata();
                    const response = await fetch(url);
                    const blob = await response.blob();

                    this.storageFiles.push({
                        path: item.fullPath,
                        metadata: metadata,
                        blob: blob,
                        type: metadata.contentType
                    });

                    this.processedItems++;
                } catch (error) {
                    console.error(`Error downloading file ${item.fullPath}:`, error);
                    // Continue with next file even if one fails
                }
            }
        } catch (error) {
            console.error('Storage backup error:', error);
            throw error;
        }
    }

    async createBackupZip() {
        // Create a backup object with timestamp
        const backup = {
            timestamp: new Date().toISOString(),
            firestore: this.firestoreData,
            storage_metadata: this.storageFiles.map(file => ({
                path: file.path,
                metadata: file.metadata
            }))
        };

        // Create media folder data
        const mediaFiles = this.storageFiles.map(file => ({
            path: file.path,
            blob: file.blob,
            type: file.type
        }));

        // Save each media file
        for (const file of mediaFiles) {
            const fileName = `firebase-media-${file.path.replace(/[^a-z0-9]/gi, '_')}`;
            saveAs(file.blob, fileName);
        }

        // Save the database JSON last
        const dbBlob = new Blob([JSON.stringify(backup, null, 2)], 
            {type: 'application/json'});
        saveAs(dbBlob, `firebase-backup-${new Date().toISOString()}.json`);
    }

    calculateProgress() {
        return this.totalItems === 0 ? 0 : 
            Math.round((this.processedItems / this.totalItems) * 100);
    }
}

const backupService = new BackupService();