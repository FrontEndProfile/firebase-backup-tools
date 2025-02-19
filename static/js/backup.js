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
        // Predefined list of collections to backup
        const FIRESTORE_COLLECTIONS = [
            'FAQs',
            'blogs',
            'blogsDummy',
            'contacts',
            'gallery',
            'media',
            'products',
            'quotes',
            'subscriptions'
        ];

        return FIRESTORE_COLLECTIONS;
    }

    async backupStorage(progressCallback) {
        try {
            // Get root reference
            const storageRef = firebaseConfig.storage.ref();
            progressCallback('Starting storage backup...', this.calculateProgress());

            // List all items recursively
            const items = await this.listAllFiles(storageRef);
            console.log('Found storage items:', items.length);
            this.totalItems += items.length;

            // Download each file
            for (const item of items) {
                progressCallback(`Downloading: ${item.fullPath}`, this.calculateProgress());

                try {
                    const url = await item.getDownloadURL();
                    const metadata = await item.getMetadata();
                    const response = await fetch(url);
                    const blob = await response.blob();

                    console.log('Successfully downloaded:', item.fullPath);
                    this.storageFiles.push({
                        path: item.fullPath,
                        metadata: metadata,
                        blob: blob,
                        type: metadata.contentType
                    });

                    this.processedItems++;
                } catch (downloadError) {
                    console.error(`Error downloading file ${item.fullPath}:`, downloadError);
                    progressCallback(`Failed to download: ${item.fullPath}`, this.calculateProgress());
                }
            }
        } catch (error) {
            console.error('Storage backup error:', error);
            throw new Error(`Storage backup failed: ${error.message}`);
        }
    }

    async listAllFiles(ref) {
        const allFiles = [];
        try {
            console.log('Listing files in:', ref.fullPath || 'root');

            // List all items in current directory
            const result = await ref.listAll();

            // Add all files from current directory
            allFiles.push(...result.items);
            console.log('Found files in current directory:', result.items.length);

            // Recursively list files in subdirectories
            for (const prefixRef of result.prefixes) {
                console.log('Exploring subdirectory:', prefixRef.fullPath);
                const subDirFiles = await this.listAllFiles(prefixRef);
                allFiles.push(...subDirFiles);
            }
        } catch (error) {
            console.error('Error listing files:', error);
        }

        return allFiles;
    }

    async createBackupFiles() {
        try {
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

            console.log('Creating backup files...');
            console.log('Total storage files to save:', this.storageFiles.length);

            // Create media folder data
            for (const file of this.storageFiles) {
                const folderPath = `${this.backupFolderName}/media/${file.path}`;
                console.log('Saving file to:', folderPath);

                try {
                    saveAs(file.blob, folderPath);
                } catch (saveError) {
                    console.error('Error saving file:', folderPath, saveError);
                }
            }

            // Save the database JSON in the backup folder
            const dbBlob = new Blob([JSON.stringify(backup, null, 2)], 
                {type: 'application/json'});
            saveAs(dbBlob, `${this.backupFolderName}/database.json`);

            console.log('Backup files creation completed');
        } catch (error) {
            console.error('Error creating backup files:', error);
            throw error;
        }
    }

    calculateProgress() {
        return this.totalItems === 0 ? 0 : 
            Math.round((this.processedItems / this.totalItems) * 100);
    }
}

const backupService = new BackupService();