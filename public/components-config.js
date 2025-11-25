const COMPONENTS_CONFIG = [
    {
        name: 'chat-dropdown',
        config: {
            html: 'chat-dropdown.html',
            target: '.assistant-container',
            insertMode: 'append'
        }
    },
    {
        name: 'navigation',
        config: {
            html: 'navigation.html',
            target: '.assistant-container',
            insertMode: 'prepend'
        }
    },
    {
        name: 'chat-window',
        config: {
            html: 'chat-window.html',
            js: 'chat-window.js',
            target: '.window-container',
            insertMode: 'append'
        }
    },
    {
        name: 'transcription-window',
        config: {
            html: 'transcription-window.html',
            js: 'transcription-window.js',
            target: '.window-container',
            insertMode: 'append'
        }
    },
    {
        name: 'settings-window',
        config: {
            html: 'settings-window.html',
            target: '.window-container',
            insertMode: 'append'
        }
    },
    {
        name: 'workflows-window',
        config: {
            html: 'workflows-window.html',
            target: '.window-container',
            insertMode: 'append'
        }
    }
];

window.COMPONENTS_CONFIG = COMPONENTS_CONFIG;

