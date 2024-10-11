library identifier: 'pipeline-library', changelog: false

worker('pod-iam-injector') {
    def namespace = 'pod-iam-injector'
    def deployment = 'pod-iam-injector'
    def containerName = 'pod-iam-injector'
    def imageName = 'pod-iam-injector'

    def commitHash
    def imageRepository

    stage('Checkout') {
        commitHash = it.checkout()
    }

    stage('Test') {
        echo 'Running tests...'
    }

    stage('Build') {
        container('docker') {
            imageRepository = dockerBuild(imageName, commitHash.substring(0, 6), ["NODE_ENV=${env.NODE_ENV}", "COMMIT_HASH=${commitHash}"], 'public')
        }
    }

    stage('Deploy') {
        container('kubectl') {
            deploy(deployment, namespace, containerName, imageRepository)
        }
    }
}
