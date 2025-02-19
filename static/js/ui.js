class UI {
    constructor() {
        this.connectBtn = document.getElementById('connectBtn');
        this.startBackupBtn = document.getElementById('startBackupBtn');
        this.backupProgress = document.getElementById('backupProgress');
        this.statusText = document.getElementById('statusText');
        this.fileList = document.getElementById('fileList');
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        this.connectBtn.addEventListener('click', () => this.connectToFirebase());
        this.startBackupBtn.addEventListener('click', () => this.startBackup());
    }

    connectToFirebase() {
        const apiKey = document.getElementById('apiKey').value.trim();
        const projectId = document.getElementById('projectId').value.trim();

        if (!apiKey || !projectId) {
            this.showError('Please enter both API Key and Project ID');
            return;
        }

        if (firebaseConfig.initialize(apiKey, projectId)) {
            document.getElementById('configSection').classList.add('d-none');
            document.getElementById('backupSection').classList.remove('d-none');
            document.getElementById('progressSection').classList.remove('d-none');
        } else {
            this.showError('Failed to connect to Firebase');
        }
    }

    async startBackup() {
        const includeFirestore = document.getElementById('firestoreCheck').checked;
        const includeStorage = document.getElementById('storageCheck').checked;

        if (!includeFirestore && !includeStorage) {
            this.showError('Please select at least one backup option');
            return;
        }

        this.startBackupBtn.disabled = true;
        this.fileList.innerHTML = '';
        this.updateProgress(0, 'Starting backup...');

        try {
            await backupService.startBackup(
                includeFirestore, 
                includeStorage, 
                (status, progress) => this.updateProgress(progress, status)
            );
        } catch (error) {
            this.showError(`Backup failed: ${error.message}`);
        } finally {
            this.startBackupBtn.disabled = false;
        }
    }

    updateProgress(progress, status) {
        this.backupProgress.style.width = `${progress}%`;
        this.backupProgress.setAttribute('aria-valuenow', progress);
        this.statusText.textContent = status;

        if (status.startsWith('Processing') || status.startsWith('Downloading')) {
            const item = document.createElement('div');
            item.textContent = status;
            this.fileList.appendChild(item);
            this.fileList.scrollTop = this.fileList.scrollHeight;
        }
    }

    showError(message) {
        this.statusText.textContent = message;
        this.statusText.classList.add('text-danger');
        setTimeout(() => {
            this.statusText.classList.remove('text-danger');
        }, 3000);
    }
}

// Initialize UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new UI();
});
