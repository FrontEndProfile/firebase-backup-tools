class FirebaseConfig {
    constructor() {
        this.app = null;
        this.db = null;
        this.storage = null;
    }

    initialize(apiKey, projectId) {
        const config = {
            apiKey: apiKey,
            projectId: projectId,
            authDomain: `${projectId}.firebaseapp.com`,
            storageBucket: `${projectId}.appspot.com`
        };

        try {
            // Initialize Firebase
            if (firebase.apps.length) {
                this.app = firebase.apps[0];
            } else {
                this.app = firebase.initializeApp(config);
            }

            // Initialize Firestore with settings
            this.db = firebase.firestore();
            this.db.settings({
                ignoreUndefinedProperties: true,
                experimentalForceLongPolling: true
            });

            // Initialize Storage with custom settings
            this.storage = firebase.storage();
            this.storage.setMaxUploadRetryTime(30000); // 30 seconds
            this.storage.setMaxOperationRetryTime(30000); // 30 seconds

            console.log('Firebase initialized successfully');
            return true;
        } catch (error) {
            console.error('Firebase initialization error:', error);
            return false;
        }
    }

    isInitialized() {
        return this.app !== null;
    }
}

const firebaseConfig = new FirebaseConfig();