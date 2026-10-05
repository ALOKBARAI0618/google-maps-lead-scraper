// Deploys the lead scraper to the Pi's own Docker from Jenkins.
//
// Design note: the service is long-lived, not a per-build job. Jenkins rebuilds
// the image and swaps the container; the campaign itself keeps running across
// that swap because all state lives on host volumes (see docker-compose.yml).
// A build must never be able to reset DONE badges or re-scrape finished cities.

pipeline {
    agent any

    environment {
        IMAGE_NAME = 'maps-lead-scraper'
    }

    parameters {
        booleanParam(
            name: 'REBUILD',
            defaultValue: true,
            description: 'Rebuild the image. Disable to just recreate the container after a config change.'
        )
    }

    stages {
        stage('Build') {
            when { expression { params.REBUILD } }
            steps {
                // Build on the Pi itself: it is arm64, and cross-building from
                // an x86 Jenkins controller would need binfmt + emulation,
                // which is far slower than native.
                sh '''
                    docker build \
                        --platform linux/arm64 \
                        -t $IMAGE_NAME:latest \
                        -t $IMAGE_NAME:$BUILD_NUMBER \
                        .
                '''
            }
        }

        stage('Pre-flight checks') {
            steps {
                // Fail the build rather than silently start a container that
                // cannot authenticate. The secret is mounted by compose; if the
                // file is missing, sync would break on every city.
                sh 'test -f gsheet-key.json || { echo "Missing gsheet-key.json - create it before deploying"; exit 1; }'
                sh 'docker compose config -q'
            }
        }

        stage('Deploy') {
            steps {
                // --no-deps: nothing else depends on this service. The 30s
                // grace period in compose lets the in-flight city's close
                // handler run before the process is force-killed.
                sh 'docker compose up -d --no-deps --force-recreate'
            }
        }

        stage('Verify') {
            steps {
                // Give the server time to bind before probing.
                sh 'sleep 10'
                sh 'docker compose ps'
                sh 'curl -fsS http://localhost:3000/ > /dev/null && echo "UI reachable"'
            }
        }
    }

    post {
        // Keep the Pi's SD card from filling with stale images. The :latest tag
        // is still referenced by the running container, so prune only removes
        // the dangling intermediate layers, never the live image.
        always {
            sh 'docker image prune -f 2>/dev/null || true'
            cleanWs()
        }
        failure {
            echo "Deploy failed. Check that gsheet-key.json exists and port 3000 is free."
        }
    }
}
