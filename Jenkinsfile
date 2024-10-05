library identifier: 'pipeline-library', changelog: false

worker('next-app') {
    def namespace = 'next-app'
    def deployment = 'next-app'
    def containerName = 'next-app'
    def imageName = 'next-app'

    stage('Checkout') {
        commitHash = it.checkout()
    }

    stage('Test') {
        echo 'Running tests...'
    }

    stage('Build') {
        container('docker') {
            dockerBuild(imageName, "latest")
        }
    }

    stage('Deploy') {
        container('kubectl') {
            deploy(deployment, namespace, containerName, imageRepository)
        }
    }
}
