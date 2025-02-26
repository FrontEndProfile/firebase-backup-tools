class BackupService {
    constructor() {
        this.firestoreData = {};
        this.storageFiles = [];
        this.totalItems = 0;
        this.processedItems = 0;
        this.backupFolderName = this.generateBackupFolderName();
        this.retryCount = 3; // Number of retries for failed downloads
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
                let success = false;
                let attempt = 0;

                while (!success && attempt < this.retryCount) {
                    try {
                        progressCallback(`Attempt ${attempt + 1}/${this.retryCount} - Processing: ${item.fullPath}`, this.calculateProgress());

                        const metadata = await item.getMetadata();
                        const downloadURL = await item.getDownloadURL();

                        // Use proxy endpoint to download
                        const response = await fetch('/proxy-download', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ url: downloadURL })
                        });

                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }

                        const result = await response.json();

                        if (result.success) {
                            // Convert hex string back to blob
                            let binaryData;
                            if (result.contentType.startsWith('text/')) {
                                binaryData = new TextEncoder().encode(result.data);
                            } else {
                                binaryData = new Uint8Array(result.data.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                            }

                            const blob = new Blob([binaryData], { type: result.contentType });

                            this.storageFiles.push({
                                path: item.fullPath,
                                metadata: metadata,
                                blob: blob,
                                type: result.contentType
                            });

                            progressCallback(`Successfully downloaded: ${item.fullPath}`, this.calculateProgress());
                            success = true;
                        } else {
                            throw new Error(result.error);
                        }
                    } catch (error) {
                        console.error(`Attempt ${attempt + 1} failed for ${item.fullPath}:`, error);
                        attempt++;
                        if (attempt === this.retryCount) {
                            progressCallback(`Failed to download ${item.fullPath} after ${this.retryCount} attempts`, this.calculateProgress());
                        }
                    }
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

            const zip = new JSZip();
            const mainFolder = zip.folder(this.backupFolderName);

            // Add Firestore data
            mainFolder.file('firestore_data.json', JSON.stringify(this.firestoreData, null, 2));

            // Add Storage files
            if (this.storageFiles.length > 0) {
                const storageFolder = mainFolder.folder('storage');
                for (const file of this.storageFiles) {
                    try {
                        const pathParts = file.path.split('/');
                        const folderPath = pathParts.slice(0, -1).join('/');
                        const fileName = pathParts[pathParts.length - 1];

                        if (folderPath) {
                            const folder = storageFolder.folder(folderPath);
                            folder.file(fileName, file.blob);
                        } else {
                            storageFolder.file(fileName, file.blob);
                        }

                        progressCallback(`Added file: ${fileName} to ${folderPath || 'root'} folder`, this.calculateProgress());
                    } catch (saveError) {
                        console.error('Error saving file:', file.path, saveError);
                    }
                }
            }

            // Add backup metadata
            const backup = {
                timestamp: new Date().toISOString(),
                folder_name: this.backupFolderName,
                firestore: Object.keys(this.firestoreData),
                storage_files: this.storageFiles.map(file => ({
                    path: file.path,
                    metadata: file.metadata
                }))
            };

            mainFolder.file('backup_metadata.json', JSON.stringify(backup, null, 2));

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