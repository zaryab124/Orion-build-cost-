/**
 * Orion Build Cost - Core Application JavaScript
 * UK Cost Estimation & Quantity Surveying Platform
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initVideoPlayer();
  initCostCalculator();
  initPortfolioLightbox();
  initStatsCounter();
  initDropzone();
  initQuoteForm();
  initFAQ();
});

/* ==========================================================================
   1. NAVBAR & NAVIGATION
   ========================================================================== */
function initNavbar() {
  const header = document.querySelector('.site-header');
  const menuToggle = document.querySelector('.menu-toggle');
  const navMenu = document.querySelector('.nav-menu');
  const navLinks = document.querySelectorAll('.nav-link');

  // Sticky header scroll state
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }, { passive: true });

  // Mobile menu toggle
  if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', () => {
      navMenu.classList.toggle('open');
      const isOpen = navMenu.classList.contains('open');
      menuToggle.setAttribute('aria-expanded', isOpen);
    });

    // Close on link click
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', false);
      });
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!header.contains(e.target)) {
        navMenu.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', false);
      }
    });
  }

  // Smooth scroll spy for active section highlight
  const sections = document.querySelectorAll('section[id]');
  window.addEventListener('scroll', () => {
    const scrollY = window.pageYOffset;
    sections.forEach(current => {
      const sectionHeight = current.offsetHeight;
      const sectionTop = current.offsetTop - 120;
      const sectionId = current.getAttribute('id');
      const correspondingLink = document.querySelector(`.nav-link[href*="${sectionId}"]`);
      if (correspondingLink) {
        if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
          correspondingLink.classList.add('active');
        } else {
          correspondingLink.classList.remove('active');
        }
      }
    });
  }, { passive: true });
}

/* ==========================================================================
   2. ARCHITECTURAL SHOWCASE VIDEO PLAYER
   ========================================================================== */
function initVideoPlayer() {
  const video = document.getElementById('orionVideo');
  if (!video) return;

  const playOverlay = document.getElementById('videoOverlay');
  const playBtn = document.getElementById('videoPlayBtn');
  const muteBtn = document.getElementById('videoMuteBtn');
  const progressBar = document.getElementById('videoProgress');
  const progressContainer = document.getElementById('videoProgressContainer');
  const timeDisplay = document.getElementById('videoTime');
  const fullscreenBtn = document.getElementById('videoFullscreenBtn');

  // Helper format time MM:SS
  function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  function togglePlay() {
    if (video.paused || video.ended) {
      video.play().then(() => {
        if (playOverlay) playOverlay.classList.add('hidden');
        updatePlayBtnIcon(true);
      }).catch(err => {
        console.warn('Playback prevented:', err);
      });
    } else {
      video.pause();
      if (playOverlay) playOverlay.classList.remove('hidden');
      updatePlayBtnIcon(false);
    }
  }

  function updatePlayBtnIcon(isPlaying) {
    if (!playBtn) return;
    if (isPlaying) {
      playBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
      `;
      playBtn.setAttribute('title', 'Pause Video');
    } else {
      playBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
      `;
      playBtn.setAttribute('title', 'Play Video');
    }
  }

  if (playOverlay) playOverlay.addEventListener('click', togglePlay);
  if (playBtn) playBtn.addEventListener('click', togglePlay);

  // Mute / Unmute
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      video.muted = !video.muted;
      if (video.muted) {
        muteBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        `;
        muteBtn.setAttribute('title', 'Unmute');
      } else {
        muteBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          </svg>
        `;
        muteBtn.setAttribute('title', 'Mute');
      }
    });
  }

  // Update progress
  video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    const percent = (video.currentTime / video.duration) * 100;
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (timeDisplay) {
      timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    }
  });

  // Seek
  if (progressContainer) {
    progressContainer.addEventListener('click', (e) => {
      const rect = progressContainer.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      video.currentTime = pos * video.duration;
    });
  }

  // Fullscreen
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      const container = video.parentElement;
      if (!document.fullscreenElement) {
        if (container.requestFullscreen) {
          container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) {
          container.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    });
  }

  // End reset
  video.addEventListener('ended', () => {
    if (playOverlay) playOverlay.classList.remove('hidden');
    updatePlayBtnIcon(false);
  });
}

/* ==========================================================================
   3. UK CONSTRUCTION COST ESTIMATION CALCULATOR
   ========================================================================== */
function initCostCalculator() {
  const projTypeSelect = document.getElementById('calcProjType');
  const floorAreaSlider = document.getElementById('calcFloorArea');
  const floorAreaInput = document.getElementById('calcFloorAreaInput');
  const locationSelect = document.getElementById('calcLocation');
  const specRadios = document.querySelectorAll('input[name="calcSpec"]');
  const resultDisplay = document.getElementById('calcResultDisplay');
  const rateDisplay = document.getElementById('calcRateDisplay');
  const applyBtn = document.getElementById('applyToQuoteBtn');

  // Trade breakdown bar elements
  const barSubstructure = document.getElementById('barSubstructure');
  const valSubstructure = document.getElementById('valSubstructure');
  const barSuperstructure = document.getElementById('barSuperstructure');
  const valSuperstructure = document.getElementById('valSuperstructure');
  const barFinishes = document.getElementById('barFinishes');
  const valFinishes = document.getElementById('valFinishes');
  const barMEP = document.getElementById('barMEP');
  const valMEP = document.getElementById('valMEP');
  const barPrelims = document.getElementById('barPrelims');
  const valPrelims = document.getElementById('valPrelims');

  if (!projTypeSelect || !floorAreaSlider || !resultDisplay) return;

  // UK Base Rates per m² (2024-2026 BCIS/RICS Benchmark Averages)
  const baseRates = {
    'residential-new': 1850,
    'residential-ext': 2100,
    'luxury-residential': 3250,
    'commercial-office': 1950,
    'retail-plaza': 1650,
    'industrial-warehouse': 1100
  };

  // UK Regional Multipliers
  const regionMultipliers = {
    'london': 1.22,
    'southeast': 1.12,
    'midlands': 1.00,
    'north': 0.98,
    'scotland': 1.04,
    'wales': 0.97
  };

  // Specification Level Multipliers
  const specMultipliers = {
    'standard': 1.0,
    'premium': 1.25,
    'luxury': 1.55
  };

  // Synchronize Slider and Numeric Input
  floorAreaSlider.addEventListener('input', (e) => {
    if (floorAreaInput) floorAreaInput.value = e.target.value;
    calculateEstimate();
  });

  if (floorAreaInput) {
    floorAreaInput.addEventListener('input', (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val)) val = 100;
      if (val > 5000) val = 5000;
      if (val < 20) val = 20;
      floorAreaSlider.value = val;
      calculateEstimate();
    });
  }

  projTypeSelect.addEventListener('change', calculateEstimate);
  locationSelect.addEventListener('change', calculateEstimate);
  specRadios.forEach(r => r.addEventListener('change', calculateEstimate));

  function calculateEstimate() {
    const projType = projTypeSelect.value || 'residential-new';
    const area = parseFloat(floorAreaSlider.value) || 200;
    const location = locationSelect.value || 'london';

    let specVal = 'premium';
    const checkedSpec = document.querySelector('input[name="calcSpec"]:checked');
    if (checkedSpec) specVal = checkedSpec.value;

    const baseRate = baseRates[projType] || 1850;
    const regionMult = regionMultipliers[location] || 1.10;
    const specMult = specMultipliers[specVal] || 1.25;

    // Unit rate per m²
    const unitRate = Math.round(baseRate * regionMult * specMult);

    // Total median cost
    const totalCost = Math.round(unitRate * area);

    // Realistic range ±8%
    const lowerCost = Math.round(totalCost * 0.92);
    const upperCost = Math.round(totalCost * 1.08);

    // Format currency string
    function formatGBP(num) {
      if (num >= 1000000) {
        return `£${(num / 1000000).toFixed(2)}M`;
      }
      return `£${num.toLocaleString('en-GB')}`;
    }

    resultDisplay.textContent = `${formatGBP(lowerCost)} – ${formatGBP(upperCost)}`;
    if (rateDisplay) {
      rateDisplay.textContent = `Average Benchmark: £${unitRate.toLocaleString('en-GB')} / m² (GIA)`;
    }

    // Trade Percentage Breakdown (Standard NRM Breakdown)
    const substructurePct = 0.14;
    const superstructurePct = 0.32;
    const finishesPct = 0.22;
    const mepPct = 0.18;
    const prelimsPct = 0.14;

    const costSub = Math.round(totalCost * substructurePct);
    const costSuper = Math.round(totalCost * superstructurePct);
    const costFinishes = Math.round(totalCost * finishesPct);
    const costMEP = Math.round(totalCost * mepPct);
    const costPrelims = Math.round(totalCost * prelimsPct);

    if (valSubstructure) valSubstructure.textContent = `${formatGBP(costSub)} (14%)`;
    if (valSuperstructure) valSuperstructure.textContent = `${formatGBP(costSuper)} (32%)`;
    if (valFinishes) valFinishes.textContent = `${formatGBP(costFinishes)} (22%)`;
    if (valMEP) valMEP.textContent = `${formatGBP(costMEP)} (18%)`;
    if (valPrelims) valPrelims.textContent = `${formatGBP(costPrelims)} (14%)`;
  }

  // Initial calculation on load
  calculateEstimate();

  // "Apply to Quote Form" Action
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const formScope = document.getElementById('quoteScope');
      const formNotes = document.getElementById('quoteNotes');
      const projTypeText = projTypeSelect.options[projTypeSelect.selectedIndex].text;
      const area = floorAreaSlider.value;
      const locationText = locationSelect.options[locationSelect.selectedIndex].text;
      const estText = resultDisplay.textContent;

      if (formNotes) {
        formNotes.value = `Instant Estimate Reference:\n- Project Type: ${projTypeText}\n- Floor Area: ${area} m²\n- Region: ${locationText}\n- Indicative Range: ${estText}\n\nPlease provide formal Bill of Quantities & tender breakdown.`;
      }

      // Scroll to quote section smoothly
      const quoteSection = document.getElementById('contact');
      if (quoteSection) {
        quoteSection.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }
}

/* ==========================================================================
   4. PORTFOLIO & BLUEPRINT LIGHTBOX GALLERY
   ========================================================================== */
function initPortfolioLightbox() {
  const tabs = document.querySelectorAll('.tab-btn');
  const cards = document.querySelectorAll('.portfolio-card');
  const modal = document.getElementById('lightboxModal');
  const modalImg = document.getElementById('lightboxImg');
  const modalTitle = document.getElementById('lightboxTitle');
  const modalCategory = document.getElementById('lightboxCategory');
  const modalClient = document.getElementById('lightboxClient');
  const modalArea = document.getElementById('lightboxArea');
  const modalStandard = document.getElementById('lightboxStandard');
  const modalScope = document.getElementById('lightboxScope');
  const closeBtn = document.getElementById('lightboxCloseBtn');
  const zoomToggle = document.getElementById('lightboxZoomToggle');

  // Filter tabs
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const filter = tab.getAttribute('data-filter');

      cards.forEach(card => {
        const cat = card.getAttribute('data-category');
        if (filter === 'all' || cat === filter) {
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

  // Modal open on card click
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const imgSrc = card.getAttribute('data-img');
      const title = card.getAttribute('data-title');
      const category = card.getAttribute('data-category-label');
      const client = card.getAttribute('data-client');
      const area = card.getAttribute('data-area');
      const standard = card.getAttribute('data-standard');
      const scope = card.getAttribute('data-scope');

      if (modalImg) {
        modalImg.src = imgSrc;
        modalImg.alt = title;
        modalImg.classList.remove('zoomed');
      }
      if (modalTitle) modalTitle.textContent = title;
      if (modalCategory) modalCategory.textContent = category;
      if (modalClient) modalClient.textContent = client;
      if (modalArea) modalArea.textContent = area;
      if (modalStandard) modalStandard.textContent = standard;
      if (modalScope) modalScope.textContent = scope;

      if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    });
  });

  // Close modal
  function closeModal() {
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
      if (modalImg) modalImg.classList.remove('zoomed');
    }
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // Zoom toggle inside lightbox
  if (zoomToggle && modalImg) {
    zoomToggle.addEventListener('click', () => {
      modalImg.classList.toggle('zoomed');
      zoomToggle.textContent = modalImg.classList.contains('zoomed') ? 'Zoom: 1.6x (Click to Reset)' : 'Click to Zoom (1.6x)';
    });
  }

  // Esc key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
      closeModal();
    }
  });
}

/* ==========================================================================
   5. ANIMATED METRICS STATS COUNTER
   ========================================================================== */
function initStatsCounter() {
  const statElements = document.querySelectorAll('.stat-num[data-target]');
  if (!statElements.length) return;

  let hasAnimated = false;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !hasAnimated) {
        hasAnimated = true;
        statElements.forEach(el => {
          const target = parseInt(el.getAttribute('data-target'), 10);
          const prefix = el.getAttribute('data-prefix') || '';
          const suffix = el.getAttribute('data-suffix') || '';
          const duration = 1800;
          const start = 0;
          const startTime = performance.now();

          function updateCounter(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic function
            const easeOutProgress = 1 - Math.pow(1 - progress, 3);
            const currentVal = Math.floor(start + (target - start) * easeOutProgress);

            el.textContent = `${prefix}${currentVal.toLocaleString()}${suffix}`;

            if (progress < 1) {
              requestAnimationFrame(updateCounter);
            } else {
              el.textContent = `${prefix}${target.toLocaleString()}${suffix}`;
            }
          }

          requestAnimationFrame(updateCounter);
        });
      }
    });
  }, { threshold: 0.3 });

  const statsSection = document.querySelector('.stats-strip');
  if (statsSection) observer.observe(statsSection);
}

/* ==========================================================================
   6. BLUEPRINT & DRAWINGS FILE UPLOAD DROPZONE
   ========================================================================== */
function initDropzone() {
  const dropzone = document.getElementById('fileDropzone');
  const fileInput = document.getElementById('drawingsInput');
  const previewList = document.getElementById('filePreviewList');

  if (!dropzone || !fileInput) return;

  const uploadedFiles = [];

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
  });

  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
  });

  function handleFiles(files) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      uploadedFiles.push(file);
    }
    renderPreviews();
  }

  function renderPreviews() {
    if (!previewList) return;
    previewList.innerHTML = '';

    uploadedFiles.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'file-item';
      const sizeKB = (file.size / 1024).toFixed(1);
      const sizeDisplay = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : `${sizeKB} KB`;

      item.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00C2FF" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <span style="font-weight:600;">${file.name}</span>
          <span style="color:#64748B;">(${sizeDisplay})</span>
        </div>
        <span class="file-remove-btn" data-index="${index}" title="Remove file">&times;</span>
      `;
      previewList.appendChild(item);
    });

    const removeBtns = previewList.querySelectorAll('.file-remove-btn');
    removeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        uploadedFiles.splice(idx, 1);
        renderPreviews();
      });
    });
  }
}

/* ==========================================================================
   7. INTERACTIVE QUOTE REQUEST FORM SUBMISSION
   ========================================================================== */
function initQuoteForm() {
  const form = document.getElementById('quoteForm');
  const modal = document.getElementById('successModal');
  const refCodeSpan = document.getElementById('modalRefCode');
  const closeBtn = document.getElementById('closeModalBtn');

  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    // Generate authentic UK Quote Reference Code
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const refCode = `OBC-2026-${randomDigits}`;

    if (refCodeSpan) refCodeSpan.textContent = refCode;

    if (modal) {
      modal.classList.add('active');
    }

    form.reset();
    const previewList = document.getElementById('filePreviewList');
    if (previewList) previewList.innerHTML = '';
  });

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }
}

/* ==========================================================================
   8. FAQ ACCORDION
   ========================================================================== */
function initFAQ() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const header = item.querySelector('.faq-header');
    if (header) {
      header.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        // Close other items for accordion feel
        faqItems.forEach(other => other.classList.remove('active'));
        if (!isActive) {
          item.classList.add('active');
        }
      });
    }
  });
}
