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
  let allNodes = [];
  let selectedIndex = 0;
  let collapsedIds = new Set();

  setTimeout(() => { searchInput.focus(); }, 50);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  
  if (currentTab) {
    bookmarkTitleInput.value = currentTab.title || "";
    bookmarkUrlInput.value = currentTab.url || "";

    chrome.bookmarks.search({ url: currentTab.url }, (results) => {
      if (results && results.length > 0) {
        existingBookmark = results[0]; // Estrae l'oggetto dall'array
        selectedFolderId = existingBookmark.parentId;
        bookmarkTitleInput.value = existingBookmark.title || currentTab.title;
        actionBtn.textContent = "Update Bookmark";
        actionBtn.className = "btn btn-update";
        duplicateBtn.style.display = "block";
      }
    });
  }

  function loadTree(query = '', maintainSelection = false) {
    chrome.bookmarks.getTree((itemTree) => {
      fullTreeData = itemTree;
      rebuildAndRender(query, maintainSelection);
    });
  }

  function rebuildAndRender(query = '', maintainSelection = false) {
    folderTree.innerHTML = '';
    allNodes = [];

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

            allNodes.push({
              id: node.id,
              title: node.title,
              depth: 0,
              hasChildren: hasChildren,
              isCollapsed: false,
              isDirectMatch: true,
              pathString: computedPath ? `(${computedPath})` : ''
            });
          }

        } else {

          // TREE VIEW
          // Comportamento originale: nessun path.
          if (parentVisible) {
            allNodes.push({
              id: node.id,
              title: node.title,
              depth: depth,
              hasChildren: hasChildren,
              isCollapsed: collapsedIds.has(node.id),
              isDirectMatch: false,
              pathString: ''
            });
          }
        }
      }

      if (node.children) {
        const shouldTraverseChildren =
          isSearching ||
          !collapsedIds.has(node.id);

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
      if (isSearching && allNodes.length > 0) {
        const firstDirectMatchIdx =
          allNodes.findIndex(n => n.isDirectMatch);

        if (firstDirectMatchIdx !== -1) {
          selectedIndex = firstDirectMatchIdx;
          selectedFolderId = allNodes[firstDirectMatchIdx].id;
        } else {
          selectedIndex = 0;
          selectedFolderId = allNodes[0].id;
        }
      } else {
        const idx =
          allNodes.findIndex(n => n.id === selectedFolderId);

        selectedIndex = idx !== -1 ? idx : 0;
      }
    }

    renderTree();
  }


  function renderTree() {
    folderTree.innerHTML = '';
    const isSearching = searchInput.value.trim().length > 0;

    allNodes.forEach((folder, index) => {
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
        tBtn.textContent = folder.isCollapsed ? '+' : '-';
        tBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (collapsedIds.has(folder.id)) {
            collapsedIds.delete(folder.id);
          } else {
            collapsedIds.add(folder.id);
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
    collapsedIds.clear();
    rebuildAndRender(searchInput.value, true);
    searchInput.focus();
  });

  collapseAllBtn.addEventListener('click', () => {
    allNodes.forEach(n => {
      if (n.hasChildren) collapsedIds.add(n.id);
    });
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

          /*
          * Trova tutti gli antenati della cartella selezionata.
          *
          * IMPORTANTE:
          * includiamo anche il nodo "1", perché nel tuo codice
          * può essere presente in collapsedIds.
          */
          function findParentPath(nodes, targetId, parents = []) {
            for (const node of nodes) {

              // Abbiamo trovato la cartella cercata
              if (node.id === targetId) {
                return parents;
              }

              if (node.children) {

                // Tutti i nodi tranne "0" possono essere stati
                // aggiunti a collapsedIds dalla tua Tree View.
                const nextParents =
                  node.id === "0"
                    ? parents
                    : [...parents, node.id];

                const result = findParentPath(
                  node.children,
                  targetId,
                  nextParents
                );

                if (result !== null) {
                  return result;
                }
              }
            }

            return null;
          }

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

          /*
          * Espandiamo SOLO gli antenati necessari.
          *
          * Non tocchiamo nessun altro ramo dell'albero.
          */
          parentPath.forEach(parentId => {
            collapsedIds.delete(parentId);
          });

          /*
          * Torniamo alla Tree View.
          */
          searchInput.value = '';

          /*
          * Ricostruisce l'albero con i parent appena espansi.
          */
          rebuildAndRender('', true);

          /*
          * A questo punto la cartella dovrebbe essere
          * presente tra gli elementi visibili.
          */
          const index = allNodes.findIndex(
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
      if (list.length > 4) list.pop();
      chrome.storage.local.set({ recents: list }, () => {
        loadRecents();
      });
    });
  }

  function executeSave() {
    if (!currentTab || allNodes.length === 0) return;

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
    if (!currentTab || allNodes.length === 0) return;
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
    if (allNodes.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % allNodes.length;
      selectedFolderId = allNodes[selectedIndex].id;
      renderTree();
    } else if (e.key === 'ArrowUp'){
      e.preventDefault();selectedIndex = (selectedIndex - 1 + allNodes.length) % allNodes.length;selectedFolderId = allNodes[selectedIndex].id;
      renderTree();
    } else if (e.key === 'Enter'){
      e.preventDefault();
      executeSave();
    }
  });
  loadTree();
  loadRecents();
});