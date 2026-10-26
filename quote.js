/**
 * Orion Build Cost - Quotation Request Wizard (Phase 3)
 */

document.addEventListener('DOMContentLoaded', () => {
  let currentStep = 1;
  const totalSteps = 4;
  const uploadedFiles = []; // { name, size, type, data }

  // Elements
  const progressBar = document.getElementById('progressBar');
  const errorBox = document.getElementById('formErrorMessage');
  const form = document.getElementById('multiStepQuoteForm');

  const pane1 = document.getElementById('paneStep1');
  const pane2 = document.getElementById('paneStep2');
  const pane3 = document.getElementById('paneStep3');
  const pane4 = document.getElementById('paneStep4');
  const pane5 = document.getElementById('paneStep5');

  const stepIndicators = [
    document.getElementById('stepIndicator1'),
    document.getElementById('stepIndicator2'),
    document.getElementById('stepIndicator3'),
    document.getElementById('stepIndicator4')
  ];

  // Helper to show error
  function showError(msg) {
    if (errorBox) {
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
      window.scrollTo({ top: errorBox.offsetTop - 100, behavior: 'smooth' });
    }
  }

  function clearError() {
    if (errorBox) {
      errorBox.textContent = '';
      errorBox.style.display = 'none';
    }
  }

  // Helper step transition
  function goToStep(step) {
    clearError();
    currentStep = step;

    // Panes
    [pane1, pane2, pane3, pane4, pane5].forEach((p, idx) => {
      if (p) p.classList.toggle('active', idx + 1 === step);
    });

    // Progress bar
    if (progressBar) {
      const pct = ((step - 1) / (totalSteps - 1)) * 100;
      progressBar.style.width = `${Math.min(100, pct)}%`;
    }

    // Step indicators
    stepIndicators.forEach((ind, idx) => {
      if (!ind) return;
      const stepNum = idx + 1;
      ind.classList.remove('active', 'completed');
      if (stepNum === step) ind.classList.add('active');
      else if (stepNum < step) ind.classList.add('completed');
    });

    // If step 4 (Review), populate review screen
    if (step === 4) {
      populateReview();
    }

    window.scrollTo({ top: 160, behavior: 'smooth' });
  }

  // Step 1 Validation
  document.getElementById('btnNext1').addEventListener('click', () => {
    const name = document.getElementById('qFullName').value.trim();
    const email = document.getElementById('qEmail').value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name || name.length < 2) {
      return showError('Please enter your full name (minimum 2 characters).');
    }
    if (!email || !emailRegex.test(email)) {
      return showError('Please enter a valid work email address.');
    }

    goToStep(2);
  });

  // Step 2 Navigation & Validation
  document.getElementById('btnBack2').addEventListener('click', () => goToStep(1));
  document.getElementById('btnNext2').addEventListener('click', () => {
    const projectType = document.getElementById('qProjectType').value;
    const ukCountry = document.getElementById('qUkCountry').value;
    const postcode = document.getElementById('qPostcode').value.trim();
    const description = document.getElementById('qDescription').value.trim();
    const checkedServices = document.querySelectorAll('input[name="services"]:checked');

    if (!projectType) {
      return showError('Please select a project type.');
    }
    if (!ukCountry) {
      return showError('Please select a UK country.');
    }
    if (!postcode) {
      return showError('Please enter the project postcode.');
    }
    if (checkedServices.length === 0) {
      return showError('Please select at least one required service.');
    }
    if (!description || description.length < 10) {
      return showError('Please provide a project description (min 10 characters) explaining your scope.');
    }

    goToStep(3);
  });

  // Step 3 Navigation & Validation (Drawings)
  document.getElementById('btnBack3').addEventListener('click', () => goToStep(2));
  document.getElementById('btnNext3').addEventListener('click', () => {
    const consent = document.getElementById('qPrivacyConsent').checked;
    if (!consent) {
      return showError('Please acknowledge the privacy notice to proceed.');
    }
    goToStep(4);
  });

  // Step 4 Navigation (Review)
  document.getElementById('btnBack4').addEventListener('click', () => goToStep(3));

  // Edit shortcuts from review screen
  document.getElementById('editContact').addEventListener('click', () => goToStep(1));
  document.getElementById('editScope').addEventListener('click', () => goToStep(2));
  document.getElementById('editFiles').addEventListener('click', () => goToStep(3));

  // Drag & drop file uploads
  const dropzone = document.getElementById('quoteDropzone');
  const fileInput = document.getElementById('quoteFileInput');
  const previewList = document.getElementById('quotePreviewList');

  if (dropzone && fileInput) {
    ['dragenter', 'dragover'].forEach(eName => {
      dropzone.addEventListener(eName, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eName => {
      dropzone.addEventListener(eName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      handleFiles(files);
    });

    fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files);
    });
  }

  function handleFiles(files) {
    clearError();
    const allowed = ['.pdf', '.dwg', '.dxf', '.png', '.jpg', '.jpeg', '.zip'];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = '.' + file.name.split('.').pop().toLowerCase();

      if (!allowed.includes(ext)) {
        showError(`File "${file.name}" has an unsupported format. Allowed: PDF, DWG, DXF, PNG, JPG, ZIP.`);
        continue;
      }

      if (file.size > 25 * 1024 * 1024) {
        showError(`File "${file.name}" exceeds the 25 MB size limit.`);
        continue;
      }

      const reader = new FileReader();
      reader.onload = function (evt) {
        uploadedFiles.push({
          name: file.name,
          size: file.size,
          data: evt.target.result
        });
        renderPreviews();
      };
      reader.readAsDataURL(file);
    }
  }

  function renderPreviews() {
    if (!previewList) return;
    previewList.innerHTML = '';

    uploadedFiles.forEach((f, idx) => {
      const item = document.createElement('div');
      item.className = 'file-item';
      const sizeMB = (f.size / (1024 * 1024)).toFixed(2);
      item.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00C2FF" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <span style="font-weight:600;">${f.name}</span>
          <span style="color:#64748B;">(${sizeMB} MB)</span>
        </div>
        <span class="file-remove-btn" data-index="${idx}" title="Remove file">&times;</span>
      `;
      previewList.appendChild(item);
    });

    previewList.querySelectorAll('.file-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        uploadedFiles.splice(idx, 1);
        renderPreviews();
      });
    });
  }

  // Populate Review Screen
  function populateReview() {
    document.getElementById('revFullName').textContent = document.getElementById('qFullName').value.trim() || '-';
    document.getElementById('revCompany').textContent = document.getElementById('qCompany').value.trim() || 'N/A';
    document.getElementById('revEmail').textContent = document.getElementById('qEmail').value.trim() || '-';
    document.getElementById('revPhone').textContent = document.getElementById('qPhone').value.trim() || 'N/A';

    document.getElementById('revProjectType').textContent = document.getElementById('qProjectType').value || '-';
    document.getElementById('revLocation').textContent = `${document.getElementById('qPostcode').value.trim().toUpperCase()}, ${document.getElementById('qUkCountry').value}`;

    const checkedServices = [...document.querySelectorAll('input[name="services"]:checked')].map(cb => cb.value);
    document.getElementById('revServices').textContent = checkedServices.join(', ') || '-';

    document.getElementById('revSize').textContent = document.getElementById('qApproxSize').value.trim() || 'Not specified';
    document.getElementById('revDeadline').textContent = document.getElementById('qDeadline').value || 'Flexible';
    document.getElementById('revDescription').textContent = document.getElementById('qDescription').value.trim() || '-';

    const revFilesList = document.getElementById('revFilesList');
    if (uploadedFiles.length === 0) {
      revFilesList.textContent = 'No drawing files attached (description only).';
    } else {
      revFilesList.innerHTML = uploadedFiles.map(f => {
        const mb = (f.size / (1024 * 1024)).toFixed(2);
        return `<div>&bull; ${f.name} (${mb} MB)</div>`;
      }).join('');
    }
  }

  // Form Submit Handling
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const submitBtn = document.getElementById('btnSubmitQuote');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Uploading Plans &amp; Submitting...</span>';
    }

    const checkedServices = [...document.querySelectorAll('input[name="services"]:checked')].map(cb => cb.value);

    const payload = {
      fullName: document.getElementById('qFullName').value.trim(),
      companyName: document.getElementById('qCompany').value.trim(),
      email: document.getElementById('qEmail').value.trim(),
      phone: document.getElementById('qPhone').value.trim(),
      projectType: document.getElementById('qProjectType').value,
      ukCountry: document.getElementById('qUkCountry').value,
      postcode: document.getElementById('qPostcode').value.trim().toUpperCase(),
      services: checkedServices,
      description: document.getElementById('qDescription').value.trim(),
      deadline: document.getElementById('qDeadline').value || null,
      approxSize: document.getElementById('qApproxSize').value.trim() || null,
      privacyConsent: document.getElementById('qPrivacyConsent').checked,
      files: uploadedFiles
    };

    try {
      const response = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Server rejected submission.');
      }

      // Success: display Step 5
      document.getElementById('confirmedRefCode').textContent = data.reference;
      document.getElementById('refCodeInline').textContent = data.reference;

      // Hide wizard progress indicator
      if (document.querySelector('.wizard-progress')) {
        document.querySelector('.wizard-progress').style.display = 'none';
      }

      goToStep(5);

    } catch (err) {
      console.error('Submission failed:', err);
      showError('Submission failed: ' + err.message);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Confirm &amp; Submit Project Information</span>';
      }
    }
  });
});
