(function () {
    const body = document.body;
    const modal = document.getElementById('new-entry-modal');
    const openButton = document.querySelector('[data-action="open-modal"]');
    if (!modal || !openButton) {
        return;
    }

    const closeElements = modal.querySelectorAll('[data-modal-close]');
    const form = modal.querySelector('form');

    function openModal() {
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        body.classList.add('modal-open');
    }

    function closeModal() {
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        body.classList.remove('modal-open');
        if (form) {
            form.reset();
        }
    }

    openButton.addEventListener('click', openModal);
    closeElements.forEach((el) => el.addEventListener('click', closeModal));

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.hidden === false) {
            closeModal();
        }
    });
}());