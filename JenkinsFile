pipeline {
    agent any

    tools {
        jdk 'JDK21'
        nodejs 'Node20'
    }

    environment {
        IMAGE_NAME = "deveshjha/its-app"
    }

    stages {

        stage('Clean Workspace') {
            steps {
                cleanWs()
            }
        }

        stage('Clone Repository') {
            steps {
                git branch: 'main',
                url: 'https://github.com/DeveshJha-00/ITS.git'
            }
        }

        stage('Frontend Dependencies') {
            steps {
                dir('frontend') {
                    bat 'npm install'
                }
            }
        }

        stage('Backend Dependencies') {
            steps {
                dir('backend') {
                    bat 'pip install -r requirements.txt'
                }
            }
        }

        stage('SonarCloud Analysis') {
    steps {
        script {

            def scannerHome = tool 'sonar-scanner'

            withSonarQubeEnv('sonarcloud') {

                bat """
                ${scannerHome}\\bin\\sonar-scanner.bat ^
                -Dsonar.projectKey=DeveshJha-00_ITS ^
                -Dsonar.organization=deveshjha-00 ^
                -Dsonar.sources=. ^
                -Dsonar.host.url=https://sonarcloud.io ^
                -Dsonar.token=%SONAR_AUTH_TOKEN%
                """
            }
        }
    }
}

        stage('Trivy Scan') {
            steps {
                bat 'trivy fs . > trivy-report.txt'
            }
        }

        stage('Build Docker Image') {
            steps {
                bat 'docker build -t %IMAGE_NAME% .'
            }
        }

        stage('Docker Login') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    bat 'echo %DOCKER_PASS% | docker login -u %DOCKER_USER% --password-stdin'
                }
            }
        }

        stage('Push Docker Image') {
            steps {
                bat 'docker push %IMAGE_NAME%'
            }
        }

        stage('Deploy Frontend to Vercel') {
            steps {
                dir('frontend') {
                    withCredentials([string(
                        credentialsId: 'vercel-token',
                        variable: 'VERCEL_TOKEN'
                    )]) {
                        bat 'npx vercel --prod --token %VERCEL_TOKEN% --yes'
                    }
                }
            }
        }
    }

    post {
        success {
            echo 'Pipeline completed successfully!'
        }
        failure {
            echo 'Pipeline failed!'
        }
    }
}