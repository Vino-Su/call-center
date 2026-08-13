(function () {
  function setReceiveState(button, on) {
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
    button.dataset.receiving = String(on);
  }
  window.CallCenterUI = {
    showModal: function (id) {
      var modal = document.getElementById(id);
      if (modal) modal.classList.add('is-visible');
    },
    hideModal: function (id) {
      var modal = document.getElementById(id);
      if (modal) modal.classList.remove('is-visible');
    },
    toast: function (message, type) {
      var toast = document.getElementById('toast');
      if (!toast) return;
      toast.textContent = message;
      toast.className = 'toast is-visible ' + (type || 'success');
      window.clearTimeout(window.__callCenterToastTimer);
      window.__callCenterToastTimer = window.setTimeout(function () { toast.className = 'toast'; }, 2600);
    },
    bindReceiveToggle: function (button, onChange) {
      if (!button) return;
      button.addEventListener('click', function () {
        var current = button.dataset.receiving === 'true';
        if (typeof onChange === 'function') onChange(current, function (next) { setReceiveState(button, next); });
        else setReceiveState(button, !current);
      });
    }
  };
  document.addEventListener('click', function (event) {
    var closeTarget = event.target.closest('[data-close-modal]');
    if (closeTarget) window.CallCenterUI.hideModal(closeTarget.dataset.closeModal);
    if (event.target.classList.contains('modal-mask')) event.target.classList.remove('is-visible');
  });
})();
