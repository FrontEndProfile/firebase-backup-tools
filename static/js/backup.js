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
        return `backup_${day}_${month}_${timestamp}`;
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

            await this.createBackupFiles(progressCallback);
            progressCallback('Backup completed successfully!', 100);
        } catch (error) {
            console.error('Backup error:', error);
            progressCallback(`Error: ${error.message}`, 0);
            throw error;
        }
    }

    async backupFirestore(progressCallback) {
        try {
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
                    console.error(`Error processing collection ${collectionName}:`, collectionError);
                }
            }
        } catch (error) {
            console.error('Firestore backup error:', error);
            throw error;
        }
    }

    async getAllCollections() {
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
            if (!firebaseConfig.storage) {
                throw new Error('Firebase Storage is not initialized');
            }

            const storageRef = firebaseConfig.storage.ref();
            progressCallback('Starting storage backup...', this.calculateProgress());

            const items = await this.listAllFiles(storageRef);
            console.log('Found storage items:', items.length);
            this.totalItems += items.length;

            for (const item of items) {
                try {
                    progressCallback(`Downloading: ${item.fullPath}`, this.calculateProgress());

                    const url = await item.getDownloadURL();
                    const metadata = await item.getMetadata();

                    const response = await fetch(url);
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                    const blob = await response.blob();
                    this.storageFiles.push({
                        path: item.fullPath,
                        metadata: metadata,
                        blob: blob,
                        type: metadata.contentType || 'application/octet-stream'
                    });

                    this.processedItems++;
                    progressCallback(`Downloaded: ${item.fullPath}`, this.calculateProgress());
                } catch (downloadError) {
                    console.error(`Error downloading file ${item.fullPath}:`, downloadError);
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
            const result = await ref.listAll();
            allFiles.push(...result.items);

            for (const prefixRef of result.prefixes) {
                const subDirFiles = await this.listAllFiles(prefixRef);
                allFiles.push(...subDirFiles);
            }
        } catch (error) {
            console.error('Error listing files:', error);
        }
        return allFiles;
    }

    async createBackupFiles(progressCallback) {
        try {
            progressCallback('Creating backup files...', this.calculateProgress());

            // Save each media file individually
            for (const file of this.storageFiles) {
                try {
                    // Get just the filename without path
                    const fileName = file.path.split('/').pop();

                    // Create a File object with proper MIME type
                    const fileObj = new File(
                        [file.blob],
                        file.path,
                        { type: file.type }
                    );

                    // Save file with full path structure
                    saveAs(fileObj, file.path);
                    progressCallback(`Saved file: ${fileName}`, this.calculateProgress());
                } catch (saveError) {
                    console.error('Error saving file:', file.path, saveError);
                }
            }

            // Create and save the JSON backup data
            const backup = {
                timestamp: new Date().toISOString(),
                folder_name: this.backupFolderName,
                firestore: this.firestoreData,
                storage_metadata: this.storageFiles.map(file => ({
                    path: file.path,
                    metadata: file.metadata
                }))
            };

            const dbBlob = new Blob(
                [JSON.stringify(backup, null, 2)],
                { type: 'application/json' }
            );

            // Save the database JSON file
            saveAs(dbBlob, 'backup_data.json');
            progressCallback('Backup files saved successfully', 100);
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