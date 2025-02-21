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
            this.app = firebase.initializeApp(config);
            this.db = firebase.firestore();
            this.storage = firebase.storage();
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
