document.addEventListener('DOMContentLoaded', async () => {
  const actionBtn = document.getElementById('actionBtn');
  const duplicateBtn = document.getElementById('duplicateBtn');
  const searchInput = document.getElementById('search');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const folderTree = document.getElementById('folderTree');
  const treeHeader = document.getElementById('treeHeader');
  const recentChips = document.getElementById('recentChips');
  const newFolderInput = document.getElementById('newFolderName');
  const createFolderBtn = document.getElementById('createFolderBtn');
  const expandAllBtn = document.getElementById('expandAllBtn');
  const collapseAllBtn = document.getElementById('collapseAllBtn');
  
  const bookmarkTitleInput = document.getElementById('bookmarkTitle');
  const bookmarkUrlInput = document.getElementById('bookmarkUrl');

  let currentTab = null;
  let existingBookmark = null; 
  let selectedFolderId = "1";
  let fullTreeData = [];
  let renderedNodes = [];   // Nodes rendered in the panel view
  let selectedIndex = 0;
  let expandedIds = new Set();

  setTimeout(() => { searchInput.focus(); }, 50);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  
  if (currentTab) {
    bookmarkTitleInput.value = currentTab.title || "";
    bookmarkUrlInput.value = currentTab.url || "";

    const results = await chrome.bookmarks.search({ url: currentTab.url });

    if (results && results.length > 0) {
      existingBookmark = results[0]; // Estrae l'oggetto dall'array
      selectedFolderId = existingBookmark.parentId;
      bookmarkTitleInput.value = existingBookmark.title || currentTab.title;
      actionBtn.textContent = "Update Bookmark";
      actionBtn.className = "btn btn-update";
      duplicateBtn.style.display = "block";
    }

  }

  function loadTree( query = '', maintainSelection = false, initialize = false) 
  {
    chrome.bookmarks.getTree((itemTree) => {
      fullTreeData = itemTree;
      if (initialize) {
        initializeTreeView();
      } else {
        rebuildAndRender(query, maintainSelection);
      }
    });
  }


  function initializeTreeView() {
    expandedIds.clear();

    // Already bookmarked:
    // expand only the branch leading to the current bookmark folder.
    if (existingBookmark) {
      const parentPath = findParentPath(
        fullTreeData,
        existingBookmark.parentId
      );

      if (parentPath) {
        parentPath.forEach(parentId => {
          expandedIds.add(parentId);
        });
      }

      rebuildAndRender('', false);
      return;
    }

    // Not bookmarked:
    // progressively expand folders until the tree needs scrolling.
    const expandableFolders = getExpandableFolders(fullTreeData);

    for (const folder of expandableFolders) {
      expandedIds.add(folder.id);

      rebuildAndRender('', false);

      if (folderTree.scrollHeight > folderTree.clientHeight) {
        break;
      }
    }

    // Make sure the final rendering reflects the selected folder.
    rebuildAndRender('', false);
  }

  function rebuildAndRender(query = '', maintainSelection = false) {
    folderTree.innerHTML = '';
    renderedNodes = [];

    const isSearching = query.trim().length > 0;
    const lowerQuery = query.toLowerCase();

    if (isSearching) {
      treeHeader.style.display = "none";
    } else {
      treeHeader.style.display = "flex";
    }

    // Costruisce il path completo della cartella:
    // Es. "Lavoro > Progetti > Chrome Extension"
    function getBuildPath(nodeId) {
      const path = [];

      function findPath(nodes, targetId, parents = []) {
        for (const node of nodes) {
          if (node.id === targetId) {
            path.push(...parents);
            return true;
          }

          if (node.children) {
            const isFolder =
              node.title &&
              !node.url &&
              node.id !== "0";

            const nextParents = isFolder
              ? [...parents, node.title]
              : parents;

            if (findPath(node.children, targetId, nextParents)) {
              return true;
            }
          }
        }

        return false;
      }

      findPath(fullTreeData, nodeId);

      return path.join(" > ");
    }

    function traverse(node, depth = 0, parentVisible = true) {
      const isFolder =
        node.title &&
        !node.url &&
        node.id !== "0";

      const hasChildren =
        node.children &&
        node.children.some(c => c.title && !c.url);

      if (isFolder) {
        if (isSearching) {

          // SEARCH VIEW
          // Mostra solamente le cartelle che corrispondono alla ricerca.
          if (node.title.toLowerCase().includes(lowerQuery)) {
            const computedPath = getBuildPath(node.id);

            renderedNodes.push({
              id: node.id,
              title: node.title,
              depth: 0,
              hasChildren: hasChildren,
              isExpanded: false,
              isDirectMatch: true,
              pathString: computedPath ? `(${computedPath})` : ''
            });
          }

        } else {
          // TREE VIEW (nessun path mostrato accanto ai bookmark)
          if (parentVisible) {
            renderedNodes.push({
              id: node.id,
              title: node.title,
              depth: depth,
              hasChildren: hasChildren,
              isExpanded: expandedIds.has(node.id),
              isDirectMatch: false,
              pathString: ''
            });
          }
        }
      }

      if (node.children) {
        const shouldTraverseChildren = node.id === "0" || isSearching || expandedIds.has(node.id);

        node.children.forEach(child => {
          traverse(
            child,
            depth + (node.id === "0" ? 0 : 1),
            parentVisible && shouldTraverseChildren
          );
        });
      }
    }

    fullTreeData.forEach(root => traverse(root));

    if (!maintainSelection) {
      if (isSearching && renderedNodes.length > 0) {
        const firstDirectMatchIdx =
          renderedNodes.findIndex(n => n.isDirectMatch);

        if (firstDirectMatchIdx !== -1) {
          selectedIndex = firstDirectMatchIdx;
          selectedFolderId = renderedNodes[firstDirectMatchIdx].id;
        } else {
          selectedIndex = 0;
          selectedFolderId = renderedNodes[0].id;
        }
      } else {
        const idx =
          renderedNodes.findIndex(n => n.id === selectedFolderId);

        selectedIndex = idx !== -1 ? idx : 0;
      }
    }

    renderTree();
  }

    /* * Trova tutti gli antenati della cartella selezionata.
  * IMPORTANTE: * includiamo anche il nodo "1", perché nel tuo codice può essere presente in collapsedIds. */
  function findParentPath(nodes, targetId, parents = []) {
    for (const node of nodes) {

      // Abbiamo trovato la cartella cercata
      if (node.id === targetId) {
        return parents;
      }

      if (node.children) {
        // Tutti i nodi tranne "0" possono essere stati // aggiunti a collapsedIds dalla tua Tree View.
        const nextParents = node.id === "0" ? parents : [...parents, node.id];
        const result = findParentPath( node.children, targetId, nextParents );

        if (result !== null) {
          return result;
        }
      }
    }

    return null;
  }

  function getExpandableFolders(nodes, result = []) {
    for (const node of nodes) {
      const isFolder = node.id !== "0" && !node.url && node.children && node.children.some(child => !child.url);
      if (isFolder) 
        { result.push(node); }
      if (node.children) 
        { getExpandableFolders(node.children, result); }
    }

    return result;
  }

  function renderTree() {
    folderTree.innerHTML = '';
    const isSearching = searchInput.value.trim().length > 0;

    renderedNodes.forEach((folder, index) => {
      const div = document.createElement('div');
      const isSelected = index === selectedIndex;
      
      if (isSelected) {
        selectedFolderId = folder.id;
      }

      div.className = `tree-item ${isSelected ? 'selected' : ''}`;
      div.style.paddingLeft = `${folder.depth * 14 + 8}px`;

      if (!isSearching && folder.hasChildren) {
        const tBtn = document.createElement('button');
        tBtn.className = 'toggle-btn';
        tBtn.textContent = folder.isExpanded ? '-' : '+';

        tBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();

          if (expandedIds.has(folder.id)) {
            expandedIds.delete(folder.id);
          } else {
            expandedIds.add(folder.id);
          }

          rebuildAndRender(searchInput.value, true);
        });
        div.appendChild(tBtn);
      } else if (!isSearching) {
        const span = document.createElement('span');
        span.className = 'toggle-placeholder';
        div.appendChild(span);
      }

      const textSpan = document.createElement('span');
      textSpan.textContent = `📁 ${folder.title}`;
      div.appendChild(textSpan);

      if (isSearching && folder.pathString) {
        const pathSpan = document.createElement('span');
        pathSpan.className = 'folder-path';
        pathSpan.textContent = ` - ${folder.pathString}`;
        div.appendChild(pathSpan);
      }

      
      div.addEventListener('click', () => {
        selectedIndex = index;
        selectedFolderId = folder.id;
        renderTree();
      });

      folderTree.appendChild(div);

      if (isSelected) {
        div.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    rebuildAndRender('', false);
    searchInput.focus();
  });

  expandAllBtn.addEventListener('click', () => {
    expandedIds.clear();

    const expandableFolders = getExpandableFolders(fullTreeData);
    expandableFolders.forEach(folder => {
      expandedIds.add(folder.id);
    });

    rebuildAndRender(searchInput.value, true);
    searchInput.focus();
  });

  collapseAllBtn.addEventListener('click', () => {
    expandedIds.clear();
    rebuildAndRender(searchInput.value, true);
    searchInput.focus();
  });

  function loadRecents() {
    chrome.storage.local.get({ recents: [] }, (data) => {
      recentChips.innerHTML = '';
      if (data.recents.length === 0) {
        recentChips.style.display = 'none';
        return;
      }
      recentChips.style.display = 'flex';
      data.recents.forEach(item => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.textContent = `🏷️ ${item.title}`;
                
        chip.addEventListener('click', () => {
          const targetId = item.id;
          const parentPath = findParentPath(
            fullTreeData,
            targetId
          );

          if (parentPath === null) {
            console.warn(
              'Cartella recente non trovata:',
              targetId
            );
            return;
          }

          /* Espandiamo SOLO gli antenati necessari. Non tocchiamo nessun altro ramo dell'albero. */
          parentPath.forEach(parentId => { expandedIds.add(parentId); });

          /* * Torniamo alla Tree View. */
          searchInput.value = '';

          /* * Ricostruisce l'albero con i parent appena espansi. */
          rebuildAndRender('', true);

          /* * A questo punto la cartella dovrebbe essere presente tra gli elementi visibili. */
          const index = renderedNodes.findIndex(
            node => node.id === targetId
          );

          if (index !== -1) {
            selectedIndex = index;
            selectedFolderId = targetId;

            renderTree();
          }

          searchInput.focus();
        });

        recentChips.appendChild(chip);
      });
    });
  }

  function saveToRecents(id, title) {
    chrome.storage.local.get({ recents: [] }, (data) => {
      let list = data.recents.filter(f => f.id !== id);
      list.unshift({ id, title });
      if (list.length > 6) list.pop();
      chrome.storage.local.set({ recents: list }, () => {
        loadRecents();
      });
    });
  }

  function executeSave() {
    if (!currentTab || renderedNodes.length === 0) return;

    const userTitle = bookmarkTitleInput.value.trim() || currentTab.title;
    const userUrl = bookmarkUrlInput.value.trim() || currentTab.url;

    const finalize = () => {
      chrome.bookmarks.get(selectedFolderId, (results) => {
        if (results && results.length > 0) {
          saveToRecents(selectedFolderId, results[0].title); // FIX: Estrae dal primo elemento dell'array
        }
        setTimeout(() => { window.close(); }, 150);
      });
    };
    if (existingBookmark) {
      chrome.bookmarks.move(existingBookmark.id, { parentId: selectedFolderId }, () => {
        chrome.bookmarks.update(existingBookmark.id, { title: userTitle, url: userUrl }, finalize);
      });
    } else {
      chrome.bookmarks.create({
        parentId: selectedFolderId,
        title: userTitle,
        url: userUrl
      }, finalize);
    }
  }
  
  function executeDuplicate() {
    if (!currentTab || renderedNodes.length === 0) return;
    const userTitle = bookmarkTitleInput.value.trim() || currentTab.title;
    const userUrl = bookmarkUrlInput.value.trim() || currentTab.url;
    const finalize = () => {
      chrome.bookmarks.get(selectedFolderId, (results) => {
        if (results && results.length > 0) {
          saveToRecents(selectedFolderId, results[0].title); // FIX: Estrae dal primo elemento dell'array
        }
        setTimeout(() => { window.close(); }, 150);
      });
    };
    chrome.bookmarks.create({
      parentId: selectedFolderId,
      title: userTitle,
      url: userUrl
    }, finalize);
  }

  createFolderBtn.addEventListener('click', () => {
    const name = newFolderInput.value.trim();
    if (!name) return;
    chrome.bookmarks.create({ parentId: selectedFolderId, title: name }, (newFolder) => {
      newFolderInput.value = '';
      selectedFolderId = newFolder.id;
      searchInput.value = '';loadTree('', false);
    });
  });
  actionBtn.addEventListener('click', executeSave);
  duplicateBtn.addEventListener('click', executeDuplicate);
  searchInput.addEventListener('input', (e) => rebuildAndRender(e.target.value, false));
  searchInput.addEventListener('keydown', (e) => {
    if (renderedNodes.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % renderedNodes.length;
      selectedFolderId = renderedNodes[selectedIndex].id;
      renderTree();
    } else if (e.key === 'ArrowUp'){
      e.preventDefault();selectedIndex = (selectedIndex - 1 + renderedNodes.length) % renderedNodes.length;selectedFolderId = renderedNodes[selectedIndex].id;
      renderTree();
    } else if (e.key === 'Enter'){
      e.preventDefault();
      executeSave();
    }
  });

  loadTree('', false, true);
  loadRecents();


});