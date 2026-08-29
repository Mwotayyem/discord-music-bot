module.exports = {
    apps: [
        {
            name: 'discord-music-bot',
            script: 'index.js',
            autorestart: true,
            watch: false,
            max_memory_restart: '512M',
            env: {
                NODE_ENV: 'production'
            }
        }
    ]
};
