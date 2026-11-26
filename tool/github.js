// GitHub 연결: 비공개 저장소의 데이터 파일 읽기 / 여러 파일을 커밋 하나로 저장.
// 토큰은 이 브라우저(localStorage)에만 저장된다.

export class GitHub {
  constructor(token, owner, repo, branch) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
  }

  async request(method, path, body) {
    const res = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    if (!res.ok) {
      let msg = `${res.status}`;
      try { msg += " " + (await res.json()).message; } catch (_) { /* 본문 없음 */ }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  // 저장소에 들어갈 수 있는지 (토큰 확인)
  async check() {
    const info = await this.request("GET", "");
    return info.permissions ? info.permissions.push : true;
  }

  // 폴더 안 파일 목록 [{name, path, sha}]. 폴더가 없으면 [].
  async list(dir) {
    try {
      const items = await this.request("GET", `/contents/${encodePath(dir)}?ref=${this.branch}`);
      return items.filter((x) => x.type === "file");
    } catch (e) {
      if (e.status === 404) return [];
      throw e;
    }
  }

  // 파일 읽기 → {text, sha}. 없으면 null.
  async read(path) {
    try {
      const f = await this.request("GET", `/contents/${encodePath(path)}?ref=${this.branch}`);
      const bytes = Uint8Array.from(atob(f.content.replace(/\n/g, "")), (c) => c.charCodeAt(0));
      return { text: new TextDecoder().decode(bytes), sha: f.sha };
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  // 여러 파일을 커밋 하나로. files = [{path, text, sha(읽을 때의 것, 새 파일이면 null)}]
  // 읽은 뒤 다른 곳에서 바뀐 파일이 있으면 저장하지 않고 그 목록을 알려 준다.
  //   그사이 다른 사람이 다른 파일을 저장해 기록이 앞서 나갔으면(422) 새 기록 위에 다시 쌓는다 (네 번까지).
  async commit(files, message, author = null) {
    for (let tries = 0; ; tries++) {
      try {
        return await this.commitOnce(files, message, author);
      } catch (e) {
        if (e.status !== 422 || tries >= 3) throw e;
        await new Promise((r) => setTimeout(r, 600 + Math.random() * 900));
      }
    }
  }

  async commitOnce(files, message, author) {
    const ref = await this.request("GET", `/git/ref/heads/${this.branch}`);
    const head = await this.request("GET", `/git/commits/${ref.object.sha}`);
    const before = await this.treeShas(head.tree.sha);
    const changed = files.filter((f) => !f.remove && (before[f.path] || null) !== (f.sha || null)).map((f) => f.path);
    if (changed.length) {
      const err = new Error("다른 곳에서 먼저 바뀐 파일이 있습니다: " + changed.join(", "));
      err.conflict = changed;
      throw err;
    }
    // 그림 같은 파일(base64)은 먼저 blob 으로 올린다
    const entries = [];
    for (const f of files) {
      if (f.remove) {
        if (before[f.path]) entries.push({ path: f.path, mode: "100644", type: "blob", sha: null });   // 지우기
      } else if (f.base64 !== undefined) {
        const blob = await this.request("POST", "/git/blobs", { content: f.base64, encoding: "base64" });
        entries.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
      } else {
        entries.push({ path: f.path, mode: "100644", type: "blob", content: f.text });
      }
    }
    const tree = await this.request("POST", "/git/trees", { base_tree: head.tree.sha, tree: entries });
    const body = { message, tree: tree.sha, parents: [ref.object.sha] };
    // 누가 저장했는지: 편집기에서 적은 이름 (토큰은 하나라도 기록에는 사람마다 남는다)
    if (author) body.author = { name: author, email: "editor@projectcr.invalid", date: new Date().toISOString() };
    const commit = await this.request("POST", "/git/commits", body);
    await this.request("PATCH", `/git/refs/heads/${this.branch}`, { sha: commit.sha });
    const after = await this.treeShas(tree.sha);
    const shas = {};
    for (const f of files) shas[f.path] = after[f.path] || null;
    return { commit: commit.sha, shas };
  }

  // 저장 기록 (최근 것부터). path 를 주면 그 파일이 바뀐 것만.
  async history(path = null, count = 30) {
    const q = `?sha=${this.branch}&per_page=${count}` + (path ? `&path=${encodeURIComponent(path)}` : "");
    return this.request("GET", `/commits${q}`);
  }

  // 저장 하나에서 바뀐 파일들
  async commitFiles(sha) {
    const c = await this.request("GET", `/commits/${sha}`);
    return { files: (c.files || []).map((f) => ({ path: f.filename, status: f.status, add: f.additions, del: f.deletions })), parent: (c.parents[0] || {}).sha || null };
  }

  // 어느 시점(커밋)의 파일 내용. 없으면 null.
  async readAt(path, ref) {
    try {
      const f = await this.request("GET", `/contents/${encodePath(path)}?ref=${ref}`);
      const bytes = Uint8Array.from(atob(f.content.replace(/\n/g, "")), (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  // 트리 전체의 파일 경로 → sha
  async treeShas(treeSha) {
    const t = await this.request("GET", `/git/trees/${treeSha}?recursive=1`);
    const out = {};
    for (const e of t.tree) if (e.type === "blob") out[e.path] = e.sha;
    return out;
  }

  // 지금 브랜치의 파일 목록 {경로: sha}. 한 번 읽은 것은 잠깐(5초) 같이 쓴다 (시작할 때 글과 그림을 함께 읽으므로).
  async headShas() {
    const now = Date.now();
    if (!this._head || now - this._head.at > 5000) {
      this._head = { at: now, shas: this.request("GET", `/git/trees/${encodeURIComponent(this.branch)}?recursive=1`).then((t) => {
        const out = {};
        for (const e of t.tree) if (e.type === "blob") out[e.path] = e.sha;
        return out;
      }) };
      this._head.shas.catch(() => { this._head = null; });
    }
    return this._head.shas;
  }

  // 파일 내용 하나 (base64). 같은 sha 는 내용이 절대 바뀌지 않으므로 브라우저에 담아 두고 다음부터 그것을 쓴다.
  async blob(sha) {
    const key = `https://blob.projectcr.invalid/${this.owner}/${this.repo}/${sha}`;
    let cache = null;
    try { cache = await caches.open("projectcr-blobs"); } catch (_) { /* 담아 둘 수 없는 브라우저 */ }
    if (cache) {
      try { const hit = await cache.match(key); if (hit) return await hit.text(); } catch (_) { /* 없던 셈 */ }
    }
    const b = await this.request("GET", `/git/blobs/${sha}`);
    const base64 = b.content.replace(/\s/g, "");
    if (cache) try { await cache.put(key, new Response(base64)); } catch (_) { /* 자리가 모자람 */ }
    return base64;
  }

  // 조건에 맞는 파일을 여러 개 동시에 (한 번에 8개까지) 읽는다 → {경로: {base64, sha}}
  async readMany(filter) {
    const shas = await this.headShas();
    const paths = Object.keys(shas).filter(filter);
    const out = {};
    let next = 0;
    const worker = async () => {
      while (next < paths.length) {
        const path = paths[next++];
        out[path] = { base64: await this.blob(shas[path]), sha: shas[path] };
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, paths.length) }, worker));
    return out;
  }

  // 지금 브랜치에서 조건에 맞는 파일을 base64 로 → {경로: {base64, sha}} (그림)
  async readAllBinary(filter) {
    return this.readMany(filter);
  }

  // 지금 브랜치에서 조건에 맞는 파일을 모두 읽기 → {경로: {text, sha}}
  async readAll(filter) {
    const raw = await this.readMany(filter);
    const out = {};
    for (const [path, f] of Object.entries(raw)) {
      const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
      out[path] = { text: new TextDecoder().decode(bytes), sha: f.sha };
    }
    return out;
  }
}

function encodePath(p) {
  return p.split("/").map(encodeURIComponent).join("/");
}
