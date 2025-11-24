// Video Autoplay on Scroll Functionality
document.addEventListener('DOMContentLoaded', function() {
    function initVideoAutoplay() {
        const video = document.querySelector('.demo-video');
        const videoContainer = document.querySelector('.video-container');
        
        if (!video || !videoContainer) {
            console.log('Video elements not found');
            return;
        }
        
        let isUserControlled = false;
        let isCurrentlyPlaying = false;
        let hasUserInteracted = false;
        
        // Ensure video is muted for autoplay compliance
        video.muted = true;
        video.volume = 0;
        
        // Try to play video immediately when loaded
        video.addEventListener('loadeddata', function() {
            console.log('Video loaded, attempting autoplay...');
            attemptAutoplay();
        });
        
        function attemptAutoplay() {
            if (!hasUserInteracted && !isCurrentlyPlaying) {
                video.play().then(() => {
                    isCurrentlyPlaying = true;
                    console.log('Video autoplay successful');
                }).catch(err => {
                    console.log('Initial autoplay failed:', err);
                    // This is normal - browsers often block initial autoplay
                });
            }
        }
        
        // Intersection Observer for scroll-triggered autoplay
        const videoObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !isUserControlled) {
                    // Video is in viewport, start autoplay
                    setTimeout(() => {
                        if (!isUserControlled && !isCurrentlyPlaying) {
                            video.play().then(() => {
                                isCurrentlyPlaying = true;
                                console.log('Video autoplay triggered by scroll');
                            }).catch(err => {
                                console.log('Scroll autoplay prevented by browser:', err);
                                // Show play button or other UI hint
                                showPlayHint();
                            });
                        }
                    }, 100); // Reduced delay for better responsiveness
                } else if (!entry.isIntersecting && video && !video.paused && !isUserControlled) {
                    // Video left viewport, pause if it was auto-playing
                    video.pause();
                    isCurrentlyPlaying = false;
                    console.log('Video paused as it left viewport');
                }
            });
        }, {
            threshold: 0.3, // Trigger when 30% of video is visible
            rootMargin: '0px 0px -5% 0px' // Reduced margin for better UX
        });
        
        // Start observing the video container
        videoObserver.observe(videoContainer);
        
        function showPlayHint() {
            // Add a subtle play button overlay if autoplay fails
            const playHint = document.createElement('div');
            playHint.className = 'video-play-hint';
            playHint.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"></polygon></svg>';
            playHint.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0,0,0,0.7);
                border-radius: 50%;
                width: 60px;
                height: 60px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                cursor: pointer;
                opacity: 0.8;
                transition: opacity 0.3s ease;
                z-index: 10;
            `;
            
            playHint.addEventListener('click', function() {
                video.play();
                playHint.remove();
                hasUserInteracted = true;
            });
            
            videoContainer.style.position = 'relative';
            videoContainer.appendChild(playHint);
            
            // Auto-hide hint after 3 seconds
            setTimeout(() => {
                if (playHint.parentNode) {
                    playHint.style.opacity = '0';
                    setTimeout(() => playHint.remove(), 300);
                }
            }, 3000);
        }
        
        // Handle user interaction with video
        video.addEventListener('click', function() {
            isUserControlled = true;
            hasUserInteracted = true;
            if (video.paused) {
                video.play();
                isCurrentlyPlaying = true;
            } else {
                video.pause();
                isCurrentlyPlaying = false;
            }
        });
        
        // Handle video seeking (user interaction)
        video.addEventListener('seeked', function() {
            isUserControlled = true;
            hasUserInteracted = true;
        });
        
        // Video play event
        video.addEventListener('play', function() {
            isCurrentlyPlaying = true;
        });
        
        // Video pause event
        video.addEventListener('pause', function() {
            isCurrentlyPlaying = false;
        });
        
        // Video ended event - reset user control after a delay
        video.addEventListener('ended', function() {
            isCurrentlyPlaying = false;
            // Reset user control after video ends to allow autoplay again
            setTimeout(() => {
                isUserControlled = false;
                console.log('User control reset, autoplay enabled again');
            }, 2000);
        });
        
        // Add video loading state
        const videoWrapper = videoContainer.querySelector('.video-wrapper');
        
        video.addEventListener('loadstart', function() {
            console.log('Video loading started');
            if (videoWrapper) {
                videoWrapper.classList.add('loading');
            }
        });
        
        video.addEventListener('loadeddata', function() {
            console.log('Video loaded successfully');
            if (videoWrapper) {
                videoWrapper.classList.remove('loading');
            }
        });
        
        video.addEventListener('error', function(e) {
            console.error('Video failed to load:', e);
            if (videoWrapper) {
                videoWrapper.classList.remove('loading');
            }
            // Show error message to user
            const errorMsg = document.createElement('div');
            errorMsg.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(255,0,0,0.8);
                color: white;
                padding: 10px 20px;
                border-radius: 5px;
                font-size: 14px;
                z-index: 10;
            `;
            errorMsg.textContent = 'Video failed to load';
            videoContainer.style.position = 'relative';
            videoContainer.appendChild(errorMsg);
        });
        
        // Reset user control when video is not interacted with for a while
        let userInteractionTimeout;
        video.addEventListener('click', function() {
            clearTimeout(userInteractionTimeout);
            userInteractionTimeout = setTimeout(() => {
                isUserControlled = false;
                console.log('User control reset due to inactivity');
            }, 10000); // Reset after 10 seconds of no interaction
        });
        
        // Add keyboard support for accessibility
        video.addEventListener('keydown', function(e) {
            if (e.code === 'Space') {
                e.preventDefault();
                isUserControlled = true;
                hasUserInteracted = true;
                if (video.paused) {
                    video.play();
                } else {
                    video.pause();
                }
            }
        });
        
        // Make video focusable for keyboard navigation
        video.setAttribute('tabindex', '0');
        
        // Cleanup observer when page unloads
        window.addEventListener('beforeunload', function() {
            if (videoObserver) {
                videoObserver.disconnect();
            }
        });
        
        console.log('Video autoplay functionality initialized');
    }
    
    // Initialize video autoplay functionality
    initVideoAutoplay();
}); 