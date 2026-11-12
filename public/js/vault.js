document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  function makeId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `${prefix}-${window.crypto.randomUUID().slice(0, 8)}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function createTrashIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '15');
    svg.setAttribute('height', '15');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.innerHTML =
      '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>';
    return svg;
  }

  function buildMapsUrlFromParts(parts) {
    const query = parts.map((p) => String(p || '').trim()).filter(Boolean).join(', ');
    if (!query) return '';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  function createFieldGroup(labelText, value, placeholder, maxLen, onInput) {
    const wrap = document.createElement('div');
    wrap.className = 'glass-form-group';
    wrap.style.marginBottom = '0.65rem';

    const label = document.createElement('label');
    label.className = 'glass-label';
    label.style.fontSize = '0.78rem';
    label.textContent = labelText;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'glass-input';
    input.placeholder = placeholder || '';
    if (maxLen) input.maxLength = maxLen;
    input.value = value || '';
    input.addEventListener('input', () => onInput(input.value, input));

    wrap.appendChild(label);
    wrap.appendChild(input);
    return { wrap, input };
  }

  // Passcode confirmation validation hints
  function bindPasscodeMatch(passId, confirmId) {
    const passEl = document.getElementById(passId);
    const confEl = document.getElementById(confirmId);
    if (!passEl || !confEl) return;
    const validate = () => {
      if (confEl.value && passEl.value !== confEl.value) {
        confEl.setCustomValidity('Passcodes do not match.');
      } else {
        confEl.setCustomValidity('');
      }
    };
    passEl.addEventListener('input', validate);
    confEl.addEventListener('input', validate);
  }
  bindPasscodeMatch('setup-passcode', 'setup-confirm-passcode');
  bindPasscodeMatch('new-vault-passcode', 'confirm-new-vault-passcode');

  // =========================================================================
  // Structured Vault Profile Editor
  // =========================================================================
  const profileForm = document.getElementById('vault-profile-form');
  const payloadInput = document.getElementById('vault-profile-payload');

  if (profileForm && payloadInput) {
    let profile = {
      identity: {
        nid: '',
        birthCertificateNo: '',
        passportNumber: '',
        tinNumber: '',
        drivingLicenseNumber: '',
        bloodGroup: '',
        customFields: [],
      },
      academics: [],
      presentAddresses: [],
      permanentAddress: {
        addressLine: '',
        villageOrArea: '',
        district: '',
        country: '',
        postalCode: '',
        mapsUrl: '',
        notes: '',
      },
      customSections: [],
    };
    let examTypes = ['PSC', 'JSC', 'SSC', 'HSC', 'Diploma', 'Bachelor / Honours', 'Master / Postgrad', 'PhD / Doctorate', 'Other'];

    try {
      const parsedProfile = JSON.parse(profileForm.dataset.initialProfile || '{}');
      if (parsedProfile && typeof parsedProfile === 'object') {
        profile = Object.assign(profile, parsedProfile);
      }
    } catch {
      // Fallback to default structure
    }

    try {
      const parsedExams = JSON.parse(profileForm.dataset.examTypes || '[]');
      if (Array.isArray(parsedExams) && parsedExams.length > 0) {
        examTypes = parsedExams;
      }
    } catch {
      // Use fallback list
    }

    // Bind Identity Fixed Fields
    const identityMap = [
      ['vault-nid', 'nid'],
      ['vault-birth-cert', 'birthCertificateNo'],
      ['vault-passport', 'passportNumber'],
      ['vault-tin', 'tinNumber'],
      ['vault-driving-license', 'drivingLicenseNumber'],
      ['vault-blood-group', 'bloodGroup'],
    ];
    identityMap.forEach(([elId, key]) => {
      const el = document.getElementById(elId);
      if (el) {
        el.addEventListener('input', () => {
          profile.identity[key] = el.value;
        });
      }
    });

    // Identity Custom Key/Value List
    const identityCustomList = document.getElementById('vault-identity-custom-list');
    const addIdentityFieldBtn = document.getElementById('add-identity-field-btn');

    function renderCustomKeyValues(container, items, placeholderLabel, placeholderVal) {
      if (!container) return;
      container.textContent = '';
      items.forEach((field, idx) => {
        const row = document.createElement('div');
        row.className = 'dynamic-row row-slide-in';
        row.style.display = 'grid';
        row.style.gridTemplateColumns = 'minmax(110px, 1fr) minmax(140px, 1.4fr) auto';
        row.style.gap = '0.55rem';
        row.style.alignItems = 'center';

        const lInput = document.createElement('input');
        lInput.type = 'text';
        lInput.className = 'glass-input';
        lInput.maxLength = 60;
        lInput.placeholder = placeholderLabel;
        lInput.value = field.label || '';
        lInput.addEventListener('input', () => {
          field.label = lInput.value;
        });

        const vInput = document.createElement('input');
        vInput.type = 'text';
        vInput.className = 'glass-input';
        vInput.maxLength = 300;
        vInput.placeholder = placeholderVal;
        vInput.value = field.value || '';
        vInput.addEventListener('input', () => {
          field.value = vInput.value;
        });

        const rmBtn = document.createElement('button');
        rmBtn.type = 'button';
        rmBtn.className = 'icon-btn-danger';
        rmBtn.setAttribute('aria-label', `Remove field ${field.label || idx + 1}`);
        rmBtn.appendChild(createTrashIcon());
        rmBtn.addEventListener('click', () => {
          items.splice(idx, 1);
          renderCustomKeyValues(container, items, placeholderLabel, placeholderVal);
        });

        row.appendChild(lInput);
        row.appendChild(vInput);
        row.appendChild(rmBtn);
        container.appendChild(row);
      });
    }

    if (addIdentityFieldBtn && identityCustomList) {
      addIdentityFieldBtn.addEventListener('click', () => {
        profile.identity.customFields = profile.identity.customFields || [];
        profile.identity.customFields.push({ id: makeId('idcf'), label: '', value: '' });
        renderCustomKeyValues(identityCustomList, profile.identity.customFields, 'Field Name (e.g. Voter ID)', 'Value');
      });
      renderCustomKeyValues(identityCustomList, profile.identity.customFields || [], 'Field Name (e.g. Voter ID)', 'Value');
    }

    // Academic & Higher Studies List
    const academicsList = document.getElementById('vault-academics-list');
    const addAcademicBtn = document.getElementById('add-academic-btn');

    function renderAcademics() {
      if (!academicsList) return;
      academicsList.textContent = '';

      if (!profile.academics || profile.academics.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'glass-label-sub';
        empty.textContent = 'No exam or higher-study records added yet. Click "+ Add Exam / Degree" for PSC, JSC, SSC, HSC, Bachelor, Master, or custom credentials.';
        academicsList.appendChild(empty);
        return;
      }

      profile.academics.forEach((rec, recIdx) => {
        rec.semesters = Array.isArray(rec.semesters) ? rec.semesters : [];
        rec.customFields = Array.isArray(rec.customFields) ? rec.customFields : [];

        const card = document.createElement('div');
        card.className = 'dynamic-row row-slide-in';
        card.style.padding = '1rem 1.1rem';

        // Header bar
        const head = document.createElement('div');
        head.style.display = 'flex';
        head.style.justifyContent = 'space-between';
        head.style.alignItems = 'center';
        head.style.gap = '0.5rem';
        head.style.marginBottom = '0.85rem';

        const headingBadge = document.createElement('strong');
        headingBadge.style.color = 'var(--accent)';
        headingBadge.style.fontSize = '0.92rem';
        headingBadge.textContent =
          rec.examType === 'Other' && rec.customExamType
            ? rec.customExamType
            : rec.examType || `Academic Record #${recIdx + 1}`;

        const removeRecBtn = document.createElement('button');
        removeRecBtn.type = 'button';
        removeRecBtn.className = 'mini-action-pill';
        removeRecBtn.style.borderColor = 'rgba(244, 63, 94, 0.4)';
        removeRecBtn.style.color = '#fda4af';
        removeRecBtn.textContent = 'Remove Record';
        removeRecBtn.addEventListener('click', () => {
          profile.academics.splice(recIdx, 1);
          renderAcademics();
        });

        head.appendChild(headingBadge);
        head.appendChild(removeRecBtn);
        card.appendChild(head);

        // Core academic fields grid
        const grid = document.createElement('div');
        grid.className = 'form-grid-2';

        // Exam type select
        const examWrap = document.createElement('div');
        examWrap.className = 'glass-form-group';
        examWrap.style.marginBottom = '0.65rem';
        const examLabel = document.createElement('label');
        examLabel.className = 'glass-label';
        examLabel.style.fontSize = '0.78rem';
        examLabel.textContent = 'Examination / Study Type';
        const examSelect = document.createElement('select');
        examSelect.className = 'glass-input glass-select';
        examTypes.forEach((et) => {
          const opt = document.createElement('option');
          opt.value = et;
          opt.textContent = et;
          if (rec.examType === et) opt.selected = true;
          examSelect.appendChild(opt);
        });
        examSelect.addEventListener('change', () => {
          rec.examType = examSelect.value;
          headingBadge.textContent =
            rec.examType === 'Other' && rec.customExamType ? rec.customExamType : rec.examType;
        });
        examWrap.appendChild(examLabel);
        examWrap.appendChild(examSelect);
        grid.appendChild(examWrap);

        const customExamField = createFieldGroup(
          'Custom Degree / Program Title',
          rec.customExamType,
          'e.g. B.Sc. in Computer Science',
          80,
          (val) => {
            rec.customExamType = val;
            if (rec.examType === 'Other' && val.trim()) {
              headingBadge.textContent = val.trim();
            }
          }
        );
        grid.appendChild(customExamField.wrap);

        grid.appendChild(
          createFieldGroup('Educational Institute', rec.institute, 'School, College, or University name', 160, (v) => {
            rec.institute = v;
          }).wrap
        );
        grid.appendChild(
          createFieldGroup('Board / University', rec.boardOrUniversity, 'e.g. Dhaka Board / BUET / DU', 120, (v) => {
            rec.boardOrUniversity = v;
          }).wrap
        );
        grid.appendChild(
          createFieldGroup('Passing Year / Session', rec.passingYear, 'e.g. 2020 or 2019-2023', 20, (v) => {
            rec.passingYear = v;
          }).wrap
        );
        grid.appendChild(
          createFieldGroup('Overall Result / GPA / CGPA', rec.overallResult, 'e.g. GPA 5.00 or CGPA 3.85', 40, (v) => {
            rec.overallResult = v;
          }).wrap
        );
        grid.appendChild(
          createFieldGroup('Institute Roll Number', rec.instituteRoll, 'Class / Student ID / Roll', 60, (v) => {
            rec.instituteRoll = v;
          }).wrap
        );
        grid.appendChild(
          createFieldGroup('Exam Roll Number', rec.examRoll, 'Board / Final exam roll', 60, (v) => {
            rec.examRoll = v;
          }).wrap
        );
        grid.appendChild(
          createFieldGroup('Exam Registration Number', rec.registrationNo, 'Registration / Reg No', 60, (v) => {
            rec.registrationNo = v;
          }).wrap
        );
        grid.appendChild(
          createFieldGroup('Major / Group / Notes', rec.notes, 'e.g. Science, Honours, Scholarship', 300, (v) => {
            rec.notes = v;
          }).wrap
        );
        card.appendChild(grid);

        // Nested Semester Results
        const semSection = document.createElement('div');
        semSection.className = 'vault-semester-list';

        const semHead = document.createElement('div');
        semHead.style.display = 'flex';
        semHead.style.justifyContent = 'space-between';
        semHead.style.alignItems = 'center';
        semHead.style.gap = '0.5rem';

        const semTitle = document.createElement('span');
        semTitle.className = 'glass-label-sub';
        semTitle.style.fontWeight = '700';
        semTitle.style.color = 'var(--text-main)';
        semTitle.textContent = 'Semester / Term Results';

        const addSemBtn = document.createElement('button');
        addSemBtn.type = 'button';
        addSemBtn.className = 'mini-action-pill mini-action-pill-accent';
        addSemBtn.textContent = '+ Add Semester Result';
        semHead.appendChild(semTitle);
        semHead.appendChild(addSemBtn);
        semSection.appendChild(semHead);

        const semRowsWrap = document.createElement('div');
        semRowsWrap.className = 'dynamic-list';

        function renderSemesters() {
          semRowsWrap.textContent = '';
          rec.semesters.forEach((sem, semIdx) => {
            const sGrid = document.createElement('div');
            sGrid.className = 'vault-semester-grid row-slide-in';

            const tIn = document.createElement('input');
            tIn.type = 'text';
            tIn.className = 'glass-input';
            tIn.placeholder = 'Semester / Term (e.g. Sem 1)';
            tIn.maxLength = 60;
            tIn.value = sem.term || '';
            tIn.addEventListener('input', () => {
              sem.term = tIn.value;
            });

            const gIn = document.createElement('input');
            gIn.type = 'text';
            gIn.className = 'glass-input';
            gIn.placeholder = 'GPA / Result';
            gIn.maxLength = 30;
            gIn.value = sem.gpa || '';
            gIn.addEventListener('input', () => {
              sem.gpa = gIn.value;
            });

            const cIn = document.createElement('input');
            cIn.type = 'text';
            cIn.className = 'glass-input';
            cIn.placeholder = 'Credits';
            cIn.maxLength = 20;
            cIn.value = sem.credits || '';
            cIn.addEventListener('input', () => {
              sem.credits = cIn.value;
            });

            const rIn = document.createElement('input');
            rIn.type = 'text';
            rIn.className = 'glass-input';
            rIn.placeholder = 'Remarks / Courses';
            rIn.maxLength = 150;
            rIn.value = sem.remarks || '';
            rIn.addEventListener('input', () => {
              sem.remarks = rIn.value;
            });

            const delSemBtn = document.createElement('button');
            delSemBtn.type = 'button';
            delSemBtn.className = 'icon-btn-danger';
            delSemBtn.setAttribute('aria-label', `Remove semester ${semIdx + 1}`);
            delSemBtn.appendChild(createTrashIcon());
            delSemBtn.addEventListener('click', () => {
              rec.semesters.splice(semIdx, 1);
              renderSemesters();
            });

            sGrid.appendChild(tIn);
            sGrid.appendChild(gIn);
            sGrid.appendChild(cIn);
            sGrid.appendChild(rIn);
            sGrid.appendChild(delSemBtn);
            semRowsWrap.appendChild(sGrid);
          });
        }

        addSemBtn.addEventListener('click', () => {
          rec.semesters.push({
            id: makeId('sem'),
            term: `Semester ${rec.semesters.length + 1}`,
            gpa: '',
            credits: '',
            remarks: '',
          });
          renderSemesters();
        });
        renderSemesters();
        semSection.appendChild(semRowsWrap);
        card.appendChild(semSection);

        // Nested Custom Academic Fields
        const acCustomSection = document.createElement('div');
        acCustomSection.className = 'vault-semester-list';

        const acCustomHead = document.createElement('div');
        acCustomHead.style.display = 'flex';
        acCustomHead.style.justifyContent = 'space-between';
        acCustomHead.style.alignItems = 'center';
        acCustomHead.style.gap = '0.5rem';

        const acCustomTitle = document.createElement('span');
        acCustomTitle.className = 'glass-label-sub';
        acCustomTitle.style.fontWeight = '700';
        acCustomTitle.textContent = 'Custom Academic Fields';

        const addAcCustomBtn = document.createElement('button');
        addAcCustomBtn.type = 'button';
        addAcCustomBtn.className = 'mini-action-pill';
        addAcCustomBtn.textContent = '+ Add Custom Field';

        const acCustomWrap = document.createElement('div');
        acCustomWrap.className = 'dynamic-list';

        addAcCustomBtn.addEventListener('click', () => {
          rec.customFields.push({ id: makeId('acf'), label: '', value: '' });
          renderCustomKeyValues(acCustomWrap, rec.customFields, 'Field (e.g. Hall / Thesis)', 'Value');
        });
        renderCustomKeyValues(acCustomWrap, rec.customFields, 'Field (e.g. Hall / Thesis)', 'Value');

        acCustomHead.appendChild(acCustomTitle);
        acCustomHead.appendChild(addAcCustomBtn);
        acCustomSection.appendChild(acCustomHead);
        acCustomSection.appendChild(acCustomWrap);
        card.appendChild(acCustomSection);

        academicsList.appendChild(card);
      });
    }

    if (addAcademicBtn && academicsList) {
      addAcademicBtn.addEventListener('click', () => {
        profile.academics = profile.academics || [];
        profile.academics.push({
          id: makeId('acad'),
          examType: 'Bachelor / Honours',
          customExamType: '',
          institute: '',
          boardOrUniversity: '',
          passingYear: '',
          instituteRoll: '',
          examRoll: '',
          registrationNo: '',
          overallResult: '',
          semesters: [],
          customFields: [],
          notes: '',
        });
        renderAcademics();
      });
      renderAcademics();
    }

    // Present Addresses List
    const presentAddressesList = document.getElementById('vault-present-addresses-list');
    const addPresentAddressBtn = document.getElementById('add-present-address-btn');

    function renderPresentAddresses() {
      if (!presentAddressesList) return;
      presentAddressesList.textContent = '';

      if (!profile.presentAddresses || profile.presentAddresses.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'glass-label-sub';
        empty.textContent = 'No present addresses added yet. Click "+ Add Present Address" to store one or more current residences.';
        presentAddressesList.appendChild(empty);
        return;
      }

      profile.presentAddresses.forEach((addr, idx) => {
        const card = document.createElement('div');
        card.className = 'dynamic-row row-slide-in';
        card.style.padding = '1rem 1.1rem';

        const head = document.createElement('div');
        head.style.display = 'flex';
        head.style.justifyContent = 'space-between';
        head.style.alignItems = 'center';
        head.style.gap = '0.5rem';
        head.style.flexWrap = 'wrap';
        head.style.marginBottom = '0.75rem';

        const title = document.createElement('strong');
        title.style.color = 'var(--accent)';
        title.style.fontSize = '0.9rem';
        title.textContent = addr.label || `Present Address #${idx + 1}`;

        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '0.45rem';
        btnGroup.style.flexWrap = 'wrap';

        const buildBtn = document.createElement('button');
        buildBtn.type = 'button';
        buildBtn.className = 'mini-action-pill';
        buildBtn.textContent = 'Build Maps Link';

        const openLink = document.createElement('a');
        openLink.className = 'mini-action-pill mini-action-pill-accent';
        openLink.target = '_blank';
        openLink.rel = 'noopener noreferrer';
        openLink.textContent = 'Open Map';
        openLink.hidden = !addr.mapsUrl;
        openLink.href = addr.mapsUrl || '#';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'mini-action-pill';
        removeBtn.style.borderColor = 'rgba(244, 63, 94, 0.4)';
        removeBtn.style.color = '#fda4af';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => {
          profile.presentAddresses.splice(idx, 1);
          renderPresentAddresses();
        });

        btnGroup.appendChild(buildBtn);
        btnGroup.appendChild(openLink);
        btnGroup.appendChild(removeBtn);
        head.appendChild(title);
        head.appendChild(btnGroup);
        card.appendChild(head);

        const grid = document.createElement('div');
        grid.className = 'form-grid-2';

        grid.appendChild(
          createFieldGroup('Address Label', addr.label, 'Current Home / Office / Dorm', 60, (v) => {
            addr.label = v;
            title.textContent = v.trim() || `Present Address #${idx + 1}`;
          }).wrap
        );
        grid.appendChild(
          createFieldGroup('Street / House / Flat', addr.addressLine, 'House, road, sector, flat', 200, (v) => {
            addr.addressLine = v;
          }).wrap
        );
        grid.appendChild(
          createFieldGroup('City / District', addr.city, 'Dhaka', 80, (v) => {
            addr.city = v;
          }).wrap
        );
        grid.appendChild(
          createFieldGroup('Postal Code', addr.postalCode, '1212', 30, (v) => {
            addr.postalCode = v;
          }).wrap
        );
        const mapsField = createFieldGroup('Google Maps Link', addr.mapsUrl, 'https://maps.google.com/?q=...', 500, (v) => {
          addr.mapsUrl = v;
          if (v && /^https?:\/\//i.test(v)) {
            openLink.href = v;
            openLink.hidden = false;
          } else {
            openLink.hidden = true;
          }
        });
        grid.appendChild(mapsField.wrap);

        grid.appendChild(
          createFieldGroup('Notes / Landmark', addr.notes, 'Gate code, landmark, floor', 300, (v) => {
            addr.notes = v;
          }).wrap
        );

        buildBtn.addEventListener('click', () => {
          const url = buildMapsUrlFromParts([addr.addressLine, addr.city, addr.postalCode]);
          if (url) {
            addr.mapsUrl = url;
            mapsField.input.value = url;
            openLink.href = url;
            openLink.hidden = false;
          }
        });

        card.appendChild(grid);
        presentAddressesList.appendChild(card);
      });
    }

    if (addPresentAddressBtn && presentAddressesList) {
      addPresentAddressBtn.addEventListener('click', () => {
        profile.presentAddresses = profile.presentAddresses || [];
        profile.presentAddresses.push({
          id: makeId('paddr'),
          label: profile.presentAddresses.length === 0 ? 'Current Residence' : 'Secondary Address',
          addressLine: '',
          city: '',
          postalCode: '',
          mapsUrl: '',
          notes: '',
        });
        renderPresentAddresses();
      });
      renderPresentAddresses();
    }

    // Bind Permanent Address Fixed Fields & Google Maps Helper
    const permFieldsMap = [
      ['perm-address-line', 'addressLine'],
      ['perm-village', 'villageOrArea'],
      ['perm-district', 'district'],
      ['perm-postal', 'postalCode'],
      ['perm-country', 'country'],
      ['perm-maps-url', 'mapsUrl'],
      ['perm-notes', 'notes'],
    ];
    const permMapsLink = document.getElementById('perm-maps-preview-link');
    const permMapsInput = document.getElementById('perm-maps-url');
    const buildPermMapsBtn = document.getElementById('build-perm-maps-btn');

    function syncPermMapAnchor() {
      if (!permMapsLink || !permMapsInput) return;
      const val = permMapsInput.value.trim();
      if (val && /^https?:\/\//i.test(val)) {
        permMapsLink.href = val;
        permMapsLink.hidden = false;
      } else {
        permMapsLink.hidden = true;
      }
    }

    permFieldsMap.forEach(([elId, key]) => {
      const el = document.getElementById(elId);
      if (el) {
        el.addEventListener('input', () => {
          profile.permanentAddress[key] = el.value;
          if (key === 'mapsUrl') syncPermMapAnchor();
        });
      }
    });

    if (buildPermMapsBtn && permMapsInput) {
      buildPermMapsBtn.addEventListener('click', () => {
        const perm = profile.permanentAddress;
        const url = buildMapsUrlFromParts([
          perm.addressLine,
          perm.villageOrArea,
          perm.district,
          perm.postalCode,
          perm.country,
        ]);
        if (url) {
          perm.mapsUrl = url;
          permMapsInput.value = url;
          syncPermMapAnchor();
        }
      });
    }

    // Custom Private Sections
    const customSectionsList = document.getElementById('vault-custom-sections-list');
    const addCustomSectionBtn = document.getElementById('add-custom-section-btn');

    function renderCustomSections() {
      if (!customSectionsList) return;
      customSectionsList.textContent = '';

      if (!profile.customSections || profile.customSections.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'glass-label-sub';
        empty.textContent = 'No custom private sections yet. Use "+ Add Custom Section" for medical records, bank info, vehicles, or emergency contacts.';
        customSectionsList.appendChild(empty);
        return;
      }

      profile.customSections.forEach((sec, secIdx) => {
        sec.fields = Array.isArray(sec.fields) ? sec.fields : [];

        const card = document.createElement('div');
        card.className = 'dynamic-row row-slide-in';
        card.style.padding = '1rem 1.1rem';

        const head = document.createElement('div');
        head.style.display = 'flex';
        head.style.justifyContent = 'space-between';
        head.style.alignItems = 'center';
        head.style.gap = '0.5rem';
        head.style.marginBottom = '0.75rem';
        head.style.flexWrap = 'wrap';

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'glass-input';
        titleInput.style.flex = '1 1 220px';
        titleInput.maxLength = 80;
        titleInput.placeholder = 'Section Title (e.g. Emergency Contacts)';
        titleInput.value = sec.title || '';
        titleInput.addEventListener('input', () => {
          sec.title = titleInput.value;
        });

        const addFieldBtn = document.createElement('button');
        addFieldBtn.type = 'button';
        addFieldBtn.className = 'mini-action-pill mini-action-pill-accent';
        addFieldBtn.textContent = '+ Add Field';

        const rmSecBtn = document.createElement('button');
        rmSecBtn.type = 'button';
        rmSecBtn.className = 'mini-action-pill';
        rmSecBtn.style.borderColor = 'rgba(244, 63, 94, 0.4)';
        rmSecBtn.style.color = '#fda4af';
        rmSecBtn.textContent = 'Remove Section';
        rmSecBtn.addEventListener('click', () => {
          profile.customSections.splice(secIdx, 1);
          renderCustomSections();
        });

        head.appendChild(titleInput);
        head.appendChild(addFieldBtn);
        head.appendChild(rmSecBtn);
        card.appendChild(head);

        const fieldsWrap = document.createElement('div');
        fieldsWrap.className = 'dynamic-list';

        addFieldBtn.addEventListener('click', () => {
          sec.fields.push({ id: makeId('csf'), label: '', value: '' });
          renderCustomKeyValues(fieldsWrap, sec.fields, 'Field Label', 'Value');
        });
        renderCustomKeyValues(fieldsWrap, sec.fields, 'Field Label', 'Value');

        card.appendChild(fieldsWrap);
        customSectionsList.appendChild(card);
      });
    }

    if (addCustomSectionBtn && customSectionsList) {
      addCustomSectionBtn.addEventListener('click', () => {
        profile.customSections = profile.customSections || [];
        profile.customSections.push({
          id: makeId('csec'),
          title: 'Private Notes',
          fields: [{ id: makeId('csf'), label: '', value: '' }],
        });
        renderCustomSections();
      });
      renderCustomSections();
    }

    function readFixedDomAndSerialize() {
      identityMap.forEach(([elId, key]) => {
        const el = document.getElementById(elId);
        if (el) profile.identity[key] = el.value;
      });
      permFieldsMap.forEach(([elId, key]) => {
        const el = document.getElementById(elId);
        if (el) profile.permanentAddress[key] = el.value;
      });
      payloadInput.value = JSON.stringify(profile);
    }

    profileForm.addEventListener('submit', () => {
      readFixedDomAndSerialize();
    });
  }

  // =========================================================================
  // Live Weighted Vault Search + OCR Highlighting
  // =========================================================================
  const searchForm = document.getElementById('vault-search-form');
  const searchInput = document.getElementById('vault-search-input');
  const searchCategoryInput = document.getElementById('vault-search-category-input');
  const searchResultsEl = document.getElementById('vault-search-results');
  const searchClearBtn = document.getElementById('vault-search-clear-btn');
  const filterBtns = document.querySelectorAll('[data-search-category]');

  if (searchForm && searchInput && searchCategoryInput && searchResultsEl) {
    let debounceTimer = null;
    let activeController = null;

    function renderSearchHits(query, hits) {
      searchResultsEl.textContent = '';
      if (!query.trim()) {
        if (searchClearBtn) searchClearBtn.hidden = true;
        return;
      }
      if (searchClearBtn) searchClearBtn.hidden = false;

      if (!Array.isArray(hits) || hits.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'vault-search-hit';
        empty.style.color = 'var(--text-muted)';
        empty.textContent = `No matching records or OCR document text found for "${query}".`;
        searchResultsEl.appendChild(empty);
        return;
      }

      hits.forEach((hit) => {
        const link = document.createElement('a');
        link.className = 'vault-search-hit row-slide-in';
        link.href = hit.sectionAnchor || '#vault-top';

        const topRow = document.createElement('div');
        topRow.style.display = 'flex';
        topRow.style.justifyContent = 'space-between';
        topRow.style.gap = '0.75rem';
        topRow.style.alignItems = 'baseline';
        topRow.style.flexWrap = 'wrap';

        const titleEl = document.createElement('strong');
        titleEl.style.color = 'var(--text-main)';
        titleEl.style.fontSize = '0.94rem';
        titleEl.textContent = hit.title || 'Vault Record';

        const subEl = document.createElement('span');
        subEl.className = 'vault-chip-muted';
        subEl.textContent = hit.subtitle || '';

        topRow.appendChild(titleEl);
        topRow.appendChild(subEl);

        const snippetWrap = document.createElement('div');
        snippetWrap.style.fontSize = '0.84rem';
        snippetWrap.style.color = 'var(--text-muted)';
        snippetWrap.style.marginTop = '0.35rem';

        const segs = Array.isArray(hit.snippetSegments) ? hit.snippetSegments : [];
        segs.forEach((seg) => {
          if (seg.highlighted) {
            const mark = document.createElement('mark');
            mark.className = 'vault-highlight';
            mark.textContent = seg.text || '';
            snippetWrap.appendChild(mark);
          } else {
            const span = document.createElement('span');
            span.textContent = seg.text || '';
            snippetWrap.appendChild(span);
          }
        });

        link.addEventListener('click', () => {
          if (hit.sectionAnchor && hit.sectionAnchor.startsWith('#vault-doc-')) {
            const cardEl = document.querySelector(hit.sectionAnchor);
            const details = cardEl && cardEl.querySelector('details');
            if (details) details.open = true;
          }
        });

        link.appendChild(topRow);
        link.appendChild(snippetWrap);
        searchResultsEl.appendChild(link);
      });
    }

    async function runLiveSearch() {
      const q = searchInput.value.trim();
      const cat = searchCategoryInput.value || 'all';
      if (!q) {
        renderSearchHits('', []);
        return;
      }

      if (activeController) activeController.abort();
      activeController = new AbortController();

      try {
        const url = new URL(searchForm.dataset.searchAction || searchForm.action, window.location.origin);
        url.searchParams.set('q', q);
        url.searchParams.set('category', cat);

        const res = await fetch(url.toString(), {
          headers: { Accept: 'application/json' },
          signal: activeController.signal,
        });
        if (!res.ok) return;
        const json = await res.json();
        if (json && json.ok && json.data && Array.isArray(json.data.hits)) {
          renderSearchHits(q, json.data.hits);
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    searchInput.addEventListener('input', () => {
      if (searchClearBtn) searchClearBtn.hidden = !searchInput.value.trim();
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runLiveSearch, 180);
    });

    filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextCat = btn.dataset.searchCategory || 'all';
        searchCategoryInput.value = nextCat;
        filterBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
        if (searchInput.value.trim()) {
          runLiveSearch();
        }
      });
    });

    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        renderSearchHits('', []);
        searchInput.focus();
      });
    }
  }

  // =========================================================================
  // Document Upload Busy State & Delete Dialog
  // =========================================================================
  const uploadDocForm = document.getElementById('vault-upload-doc-form');
  const uploadDocBtn = document.getElementById('doc-upload-submit-btn');
  if (uploadDocForm && uploadDocBtn) {
    uploadDocForm.addEventListener('submit', () => {
      uploadDocBtn.disabled = true;
      uploadDocBtn.textContent = 'Compressing, Running OCR & Encrypting...';
    });
  }

  const deleteDialog = document.getElementById('vault-delete-dialog');
  const deleteDialogText = document.getElementById('vault-delete-dialog-text');
  const deleteForm = document.getElementById('vault-delete-confirm-form');
  const deleteCancelBtn = document.getElementById('vault-delete-cancel-btn');

  if (deleteDialog && deleteForm) {
    document.querySelectorAll('.js-vault-delete-doc').forEach((btn) => {
      btn.addEventListener('click', () => {
        deleteForm.action = btn.dataset.deleteAction || '';
        const title = btn.dataset.docTitle || 'this document';
        if (deleteDialogText) {
          deleteDialogText.textContent = `Permanently delete "${title}" and remove its encrypted file and OCR index from your vault?`;
        }
        if (typeof deleteDialog.showModal === 'function') {
          deleteDialog.showModal();
        }
      });
    });

    if (deleteCancelBtn) {
      deleteCancelBtn.addEventListener('click', () => {
        deleteDialog.close();
      });
    }
  }
});
