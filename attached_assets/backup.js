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
                    progressCallback(`Processing: ${item.fullPath}`, this.calculateProgress());

                    const url = await item.getDownloadURL();
                    const metadata = await item.getMetadata();

                    progressCallback(`Downloading: ${item.fullPath}`, this.calculateProgress());

                    // Modified fetch request with proper CORS handling
                    const response = await fetch(url, {
                        method: 'GET',
                        mode: 'cors',
                        headers: {
                            'Accept': 'application/octet-stream, */*',
                            'Origin': window.location.origin
                        }
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const blob = await response.blob();
                    if (!blob || blob.size === 0) {
                        throw new Error('Downloaded blob is empty');
                    }

                    console.log(`Successfully downloaded ${item.fullPath}, size: ${blob.size} bytes`);

                    this.storageFiles.push({
                        path: item.fullPath,
                        metadata: metadata,
                        blob: blob,
                        type: metadata.contentType || 'application/octet-stream'
                    });
                    progressCallback(`Successfully downloaded: ${item.fullPath}`, this.calculateProgress());
                } catch (blobError) {
                    console.warn(`Error processing file ${item.fullPath}:`, blobError);
                    progressCallback(`Warning: Could not process ${item.fullPath} - ${blobError.message}`, this.calculateProgress());
                }

                this.processedItems++;
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

            // Create zip object
            const zip = new JSZip();
            const mainFolder = zip.folder(this.backupFolderName);

            // Save Firestore data
            mainFolder.file('firestore_data.json', JSON.stringify(this.firestoreData, null, 2));

            // Create storage folder and save files with structure
            if (this.storageFiles.length > 0) {
                const storageFolder = mainFolder.folder('storage');
                for (const file of this.storageFiles) {
                    try {
                        const pathParts = file.path.split('/');
                        const folderPath = pathParts.slice(0, -1).join('/');
                        const fileName = pathParts[pathParts.length - 1];

                        // Create folder structure and add file
                        const folder = storageFolder.folder(folderPath);
                        folder.file(fileName, file.blob);

                        progressCallback(`Added file: ${fileName} to ${folderPath} folder`, this.calculateProgress());
                    } catch (saveError) {
                        console.error('Error saving file:', file.path, saveError);
                    }
                }
            }

            // Add backup metadata
            const backup = {
                timestamp: new Date().toISOString(),
                folder_name: this.backupFolderName,
                firestore: this.firestoreData,
                storage_metadata: this.storageFiles.map(file => ({
                    path: file.path,
                    metadata: file.metadata
                }))
            };

            mainFolder.file('backup_metadata.json', JSON.stringify(backup, null, 2));

            // Generate and download zip file
            const zipBlob = await zip.generateAsync({type: 'blob'});
            saveAs(zipBlob, `${this.backupFolderName}.zip`);
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

window.backupService = new BackupService();