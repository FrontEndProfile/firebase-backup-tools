class BackupService {
    constructor() {
        this.firestoreData = {};
        this.storageFiles = [];
        this.totalItems = 0;
        this.processedItems = 0;
        this.backupFolderName = this.generateBackupFolderName();
    }

    generateBackupFolderName() {
        const date = new Date();
        const day = date.getDate().toString().padStart(2, '0');
        const month = date.toLocaleString('default', { month: 'short' });
        const timestamp = date.getTime();
        return `${day}_${month}_backup_${timestamp}`;
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

            await this.createBackupFiles();
            progressCallback('Backup completed successfully!', 100);
        } catch (error) {
            console.error('Backup error:', error);
            progressCallback(`Error: ${error.message}`, 0);
            throw error;
        }
    }

    async backupFirestore(progressCallback) {
        try {
            // Get all collections dynamically
            const collections = await this.getAllCollections();
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

    async getAllCollections() {
        const collections = [];

        // Get all collections at root level
        const rootCollections = await firebaseConfig.db.getCollections();
        if (rootCollections && rootCollections.length > 0) {
            collections.push(...rootCollections.map(col => col.id));
        } else {
            // Fallback: Try accessing common collection names
            const commonCollections = ['products', 'blogs', 'gallery', 'users', 'orders', 'settings'];
            for (const colName of commonCollections) {
                try {
                    const colRef = firebaseConfig.db.collection(colName);
                    const snapshot = await colRef.limit(1).get();
                    if (!snapshot.empty) {
                        collections.push(colName);
                    }
                } catch (e) {
                    console.warn(`Collection ${colName} not found`);
                }
            }
        }

        return collections;
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

    async createBackupFiles() {
        // Create a backup object with timestamp
        const backup = {
            timestamp: new Date().toISOString(),
            folder_name: this.backupFolderName,
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

        // Save each media file in the backup folder
        for (const file of mediaFiles) {
            const fileName = `${this.backupFolderName}/media/${file.path.replace(/[^a-z0-9]/gi, '_')}`;
            saveAs(file.blob, fileName);
        }

        // Save the database JSON in the backup folder
        const dbBlob = new Blob([JSON.stringify(backup, null, 2)], 
            {type: 'application/json'});
        saveAs(dbBlob, `${this.backupFolderName}/database.json`);
    }

    calculateProgress() {
        return this.totalItems === 0 ? 0 : 
            Math.round((this.processedItems / this.totalItems) * 100);
    }
}

const backupService = new BackupService();