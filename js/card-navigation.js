document.addEventListener('DOMContentLoaded', () => {
    const featureSections = document.querySelectorAll('.feature-section');

    featureSections.forEach(section => {
        const cards = section.querySelector('.cards');
        const cardElements = section.querySelectorAll('.feature-card');
        const prevBtn = section.querySelector('.nav-btn.prev');
        const nextBtn = section.querySelector('.nav-btn.next');
        const indicators = section.querySelector('.nav-indicators');

        if (!cards || cardElements.length === 0) return;

        let currentIndex = 0;
        const cardWidth = cardElements[0].offsetWidth + parseInt(getComputedStyle(cardElements[0]).marginRight);
        const visibleCards = Math.floor(cards.offsetWidth / cardWidth);
        const maxIndex = Math.max(0, cardElements.length - visibleCards);

        // Create indicator dots
        cardElements.forEach((_, index) => {
            const dot = document.createElement('div');
            dot.classList.add('nav-dot');
            if (index === 0) dot.classList.add('active');
            dot.addEventListener('click', () => navigateToCard(index));
            indicators.appendChild(dot);
        });

        // Update navigation state
        const updateNavigation = () => {
            prevBtn.disabled = currentIndex === 0;
            nextBtn.disabled = currentIndex >= maxIndex;

            // Update indicators
            indicators.querySelectorAll('.nav-dot').forEach((dot, index) => {
                dot.classList.toggle('active', index === currentIndex);
            });

            // Update cards transform
            cards.style.transform = `translateX(-${currentIndex * cardWidth}px)`;
        };

        // Navigation functions
        const navigateToCard = (index) => {
            currentIndex = Math.max(0, Math.min(index, maxIndex));
            updateNavigation();
        };

        // Event listeners
        prevBtn.addEventListener('click', () => navigateToCard(currentIndex - 1));
        nextBtn.addEventListener('click', () => navigateToCard(currentIndex + 1));

        // Initialize navigation state
        updateNavigation();

        // Handle window resize
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const newCardWidth = cardElements[0].offsetWidth + parseInt(getComputedStyle(cardElements[0]).marginRight);
                const newVisibleCards = Math.floor(cards.offsetWidth / newCardWidth);
                const newMaxIndex = Math.max(0, cardElements.length - newVisibleCards);
                
                currentIndex = Math.min(currentIndex, newMaxIndex);
                updateNavigation();
            }, 150);
        });
    });
}); 