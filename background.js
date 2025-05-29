// Meeting platform patterns
const MEETING_PATTERNS = [
    "*://*.zoom.us/j/*",
    "*://*.zoom.us/s/*",
    "*://meet.google.com/*",
    "*://*.teams.microsoft.com/*",
    "*://*.webex.com/meet/*"
];

// Function to check if a URL matches meeting patterns
function isMeetingUrl(url) {
    return MEETING_PATTERNS.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(url);
    });
}

// Track active meeting tabs
let activeMeetingTabs = new Set();

// Listen for tab updates
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//     if (changeInfo.status === 'complete' && tab.url) {
//         const isMeeting = isMeetingUrl(tab.url);

//         if (isMeeting && !activeMeetingTabs.has(tabId)) {
//             activeMeetingTabs.add(tabId);

//             // Create notification popup
//             chrome.notifications.create(`meeting-${tabId}`, {
//                 type: 'basic',
//                 iconUrl: 'icon48.png',
//                 title: 'Meeting Detected',
//                 message: 'Would you like to start transcribing this meeting?',
//                 buttons: [
//                     { title: 'Start Transcribing' },
//                     { title: 'Not Now' }
//                 ],
//                 requireInteraction: true
//             });
//         }
//     }
// });

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        const isMeeting = isMeetingUrl(tab.url);

        if (isMeeting && !activeMeetingTabs.has(tabId)) {
            activeMeetingTabs.add(tabId);

            // Create notification popup
            chrome.notifications.create(`meeting-${tabId}`, {
                type: 'basic',
                iconUrl: 'icon48.png',
                title: 'Meeting Detected',
                message: 'Would you like to start transcribing this meeting?',
                buttons: [
                    { title: 'Start Transcribing' },
                    { title: 'Not Now' }
                ],
                requireInteraction: true
            });
        }
    }
});

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    const tabId = notificationId.split('-')[1];
    if (buttonIndex === 0) { // Start Transcribing
        chrome.tabs.sendMessage(parseInt(tabId), { action: 'startTranscribing' });
    }
    chrome.notifications.clear(notificationId);
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    activeMeetingTabs.delete(tabId);
});