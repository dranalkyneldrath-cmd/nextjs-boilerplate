const API_URL = 'https://rythor-deals-backend.onrender.com/api';

let listaProdutos = []; // Produtos vindos do backend

/* ---------- Persistência (funções top-level, disponíveis assim que o script carrega) ---------- */

function lerArmazenamento(chave, padrao) {
    try {
        const dados = localStorage.getItem(chave);
        return dados ? JSON.parse(dados) : padrao;
    } catch (e) {
        return padrao;
    }
}

let carrinho = lerArmazenamento("rythor_carrinho", []);
let favoritos = lerArmazenamento("rythor_favoritos", []);       // lista de nomes de produtos curtidos
let vistosRecentemente = lerArmazenamento("rythor_vistos", []); // lista de nomes, mais recente primeiro

// Mapa de lojas suportadas -> classe de cor e rótulo de exibição.
// Produtos antigos sem o campo "loja" caem em "outro" (rótulo genérico).
const LOJAS = {
    amazon:     { label: "Amazon",     classe: "loja-amazon" },
    aliexpress: { label: "AliExpress", classe: "loja-aliexpress" },
    shopee:     { label: "Shopee",     classe: "loja-shopee" },
    kabum:      { label: "Kabum",      classe: "loja-kabum" },
    outro:      { label: "Oferta",     classe: "loja-outro" }
};

function infoLoja(chave) {
    return LOJAS[(chave || "outro").toLowerCase()] || LOJAS.outro;
}

document.addEventListener("DOMContentLoaded", () => {
    const gridEl = document.getElementById("produtos-grid");
    const cartCounterEl = document.getElementById("cart-counter");
    const filterTabs = document.querySelectorAll(".filter-tab");
    const btnCart = document.getElementById("btn-cart");
    const btnCoupon = document.getElementById("btn-coupon");
    const btnConta = document.getElementById("btn-conta");
    const btnAlert = document.getElementById("btn-alert");
    const searchInput = document.getElementById("busca-produto");
    const sortSelect = document.getElementById("ordenar-produtos");
    const vistosContainer = document.getElementById("vistos-lista");

    /* ---------- Utilidades de segurança ---------- */

    function escapeHTML(valor) {
        const div = document.createElement("div");
        div.textContent = valor ?? "";
        return div.innerHTML;
    }

    function linkSeguro(url) {
        try {
            const parsed = new URL(url, window.location.href);
            if (parsed.protocol === "http:" || parsed.protocol === "https:") {
                return parsed.href;
            }
        } catch (e) { /* URL inválida */ }
        return "#";
    }

    /* ---------- Toasts (substituem os alert()) ---------- */

    function mostrarToast(mensagem, tipo = "info") {
        let container = document.getElementById("toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "toast-container";
            document.body.appendChild(container);
        }
        const toast = document.createElement("div");
        toast.className = `toast ${tipo}`;
        toast.textContent = mensagem;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    /* ---------- Carrinho ---------- */

    function salvarCarrinho() {
        localStorage.setItem("rythor_carrinho", JSON.stringify(carrinho));
        atualizarContadorCarrinho();
    }

    function atualizarContadorCarrinho() {
        if (cartCounterEl) cartCounterEl.textContent = carrinho.length;
    }

    function adicionarAoCarrinho(produto) {
        carrinho.push(produto);
        salvarCarrinho();
        mostrarToast(`"${produto.nome}" adicionado ao carrinho.`, "sucesso");
    }

    function removerDoCarrinho(index) {
        carrinho.splice(index, 1);
        salvarCarrinho();
        renderizarCarrinho();
    }

    function criarModalCarrinho() {
        if (document.getElementById("modal-carrinho")) return;
        const overlay = document.createElement("div");
        overlay.id = "modal-carrinho";
        overlay.className = "modal-overlay hidden";
        overlay.innerHTML = `
            <div class="modal-caixa">
                <button class="modal-fechar" id="fechar-modal-carrinho">✕</button>
                <h3>Seu carrinho</h3>
                <div id="lista-itens-carrinho"></div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.getElementById("fechar-modal-carrinho").addEventListener("click", () => {
            overlay.classList.add("hidden");
        });
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.classList.add("hidden");
        });
    }

    function renderizarCarrinho() {
        const lista = document.getElementById("lista-itens-carrinho");
        if (!lista) return;
        if (carrinho.length === 0) {
            lista.innerHTML = `<p style="color: var(--text-muted);">Seu carrinho está vazio. Adicione produtos na vitrine.</p>`;
            return;
        }
        lista.innerHTML = "";
        carrinho.forEach((item, index) => {
            const linha = document.createElement("div");
            linha.className = "item-carrinho";
            linha.innerHTML = `
                <span>${escapeHTML(item.nome)}</span>
                <span class="preco-tag" style="font-size:1rem;">${escapeHTML(formatarPreco(item.preco))}</span>
                <button class="remover-item" data-index="${index}">remover</button>
            `;
            lista.appendChild(linha);
        });
        lista.querySelectorAll(".remover-item").forEach(btn => {
            btn.addEventListener("click", (e) => {
                removerDoCarrinho(Number(e.currentTarget.dataset.index));
            });
        });
    }

    function abrirCarrinho() {
        criarModalCarrinho();
        renderizarCarrinho();
        document.getElementById("modal-carrinho").classList.remove("hidden");
    }

    /* ---------- Favoritos (persistidos por nome do produto) ---------- */

    function ehFavorito(produto) {
        return favoritos.includes(produto.nome);
    }

    function alternarFavorito(produto) {
        if (ehFavorito(produto)) {
            favoritos = favoritos.filter(nome => nome !== produto.nome);
        } else {
            favoritos.push(produto.nome);
            mostrarToast(`"${produto.nome}" adicionado aos favoritos.`, "sucesso");
        }
        localStorage.setItem("rythor_favoritos", JSON.stringify(favoritos));
    }

    /* ---------- Visto recentemente ---------- */

    function registrarVisto(produto) {
        vistosRecentemente = [produto.nome, ...vistosRecentemente.filter(n => n !== produto.nome)].slice(0, 8);
        localStorage.setItem("rythor_vistos", JSON.stringify(vistosRecentemente));
        renderizarVistos();
    }

    function renderizarVistos() {
        if (!vistosContainer) return;
        const secao = document.getElementById("secao-vistos");
        if (vistosRecentemente.length === 0) {
            if (secao) secao.classList.add("hidden");
            return;
        }
        if (secao) secao.classList.remove("hidden");
        vistosContainer.innerHTML = "";
        vistosRecentemente.forEach(nome => {
            const chip = document.createElement("div");
            chip.className = "visto-chip";
            chip.textContent = nome;
            chip.addEventListener("click", () => {
                const produto = listaProdutos.find(p => p.nome === nome);
                if (produto) abrirQuickView(produto);
            });
            vistosContainer.appendChild(chip);
        });
    }

    /* ---------- Quick view (detalhes do produto em modal) ---------- */

    function criarModalQuickView() {
        if (document.getElementById("modal-quickview")) return;
        const overlay = document.createElement("div");
        overlay.id = "modal-quickview";
        overlay.className = "modal-overlay hidden";
        overlay.innerHTML = `
            <div class="modal-caixa">
                <button class="modal-fechar" id="fechar-quickview">✕</button>
                <div class="qv-conteudo" id="qv-conteudo"></div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.getElementById("fechar-quickview").addEventListener("click", () => overlay.classList.add("hidden"));
        overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.add("hidden"); });
    }

    function abrirQuickView(produto) {
        criarModalQuickView();
        registrarVisto(produto);
        const loja = infoLoja(produto.loja);
        const conteudo = document.getElementById("qv-conteudo");
        conteudo.innerHTML = `
            <span class="badge-cat">${escapeHTML(produto.categoria)}</span>
            <h3>${escapeHTML(produto.nome)}</h3>
            <span class="badge-loja ${loja.classe}">${escapeHTML(loja.label)}</span>
            <p class="qv-preco-grande">${escapeHTML(formatarPreco(produto.preco))}</p>
            <p style="color: var(--text-muted);">Produto verificado com link exclusivo de afiliado.</p>
            <div class="qv-lojas">
                <button class="btn-comprar" id="qv-add-carrinho" style="background:#333;">+ carrinho</button>
                <a href="${linkSeguro(produto.linkAfiliado)}" target="_blank" rel="noopener noreferrer" class="btn-comprar" style="text-decoration:none; display:inline-block;">Garantir Oferta</a>
            </div>
        `;
        document.getElementById("qv-add-carrinho").addEventListener("click", () => adicionarAoCarrinho(produto));
        document.getElementById("modal-quickview").classList.remove("hidden");
    }

    /* ---------- Formatação ---------- */

    function formatarPreco(preco) {
        if (typeof preco === "number") {
            return preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        }
        return preco;
    }

    function normalizar(texto) {
        if (!texto) return "";
        return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }

    /* ---------- Busca ao backend (com timeout) ---------- */

    async function fetchComTimeout(url, opcoes = {}, timeoutMs = 10000) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const resposta = await fetch(url, { ...opcoes, signal: controller.signal });
            return resposta;
        } finally {
            clearTimeout(id);
        }
    }

    async function carregarProdutosDoBackend() {
        gridEl.innerHTML = Array.from({ length: 6 })
            .map(() => `<div class="skeleton-card"></div>`)
            .join("");

        try {
            const resposta = await fetchComTimeout(`${API_URL}/produtos`);
            if (!resposta.ok) throw new Error(`Servidor respondeu com status ${resposta.status}`);
            const dados = await resposta.json();

            if (dados.produtos && dados.produtos.length > 0) {
                listaProdutos = dados.produtos;
                renderizarVitrine(listaProdutos);
                renderizarVistos();
            } else {
                gridEl.innerHTML = `<div class="estado-vazio">Nenhum produto cadastrado no momento. Volte em breve!</div>`;
            }
        } catch (err) {
            console.error("Erro ao conectar com o backend:", err);
            gridEl.innerHTML = `<div class="estado-vazio erro">Não foi possível carregar as ofertas agora. Tente novamente em instantes.</div>`;
        }
    }

    /* ---------- Renderização (com dados escapados) ---------- */

    function renderizarVitrine(produtosParaMostrar) {
        gridEl.innerHTML = "";

        if (produtosParaMostrar.length === 0) {
            gridEl.innerHTML = `<div class="estado-vazio">Nenhum item encontrado para esse filtro/busca.</div>`;
            return;
        }

        produtosParaMostrar.forEach((prod, idx) => {
            const card = document.createElement("div");
            card.classList.add("card-produto");
            const loja = infoLoja(prod.loja);
            const favoritado = ehFavorito(prod);

            card.innerHTML = `
                <div>
                    <div class="card-top-info">
                        <div>
                            <span class="badge-cat">${escapeHTML(prod.categoria)}</span>
                            <span class="badge-loja ${loja.classe}">${escapeHTML(loja.label)}</span>
                        </div>
                        <button class="like-btn ${favoritado ? 'liked' : ''}" title="Favoritar">${favoritado ? '♥' : '♡'}</button>
                    </div>
                    <h4 class="titulo-produto" style="cursor:pointer;" data-index="${idx}">${escapeHTML(prod.nome)}</h4>
                    <p>Produto verificado com link exclusivo de afiliado.</p>
                </div>
                <div class="card-footer-info">
                    <span class="preco-tag">${escapeHTML(formatarPreco(prod.preco))}</span>
                    <div style="display:flex; gap:8px;">
                        <button class="btn-comprar btn-add-carrinho" data-index="${idx}" style="background:#333;">+ carrinho</button>
                        <a href="${linkSeguro(prod.linkAfiliado)}" target="_blank" rel="noopener noreferrer" class="btn-comprar" style="text-decoration: none; display: inline-block; text-align: center;">Garantir Oferta</a>
                    </div>
                </div>
            `;

            gridEl.appendChild(card);
        });

        ativarBotoesCards(produtosParaMostrar);
    }

    function ativarBotoesCards(produtosVisiveis) {
        document.querySelectorAll(".like-btn").forEach((btn, i) => {
            btn.addEventListener("click", (e) => {
                const produto = produtosVisiveis[i];
                alternarFavorito(produto);
                const agora = ehFavorito(produto);
                e.currentTarget.classList.toggle("liked", agora);
                e.currentTarget.textContent = agora ? "♥" : "♡";
            });
        });

        document.querySelectorAll(".btn-add-carrinho").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = Number(e.currentTarget.dataset.index);
                adicionarAoCarrinho(produtosVisiveis[idx]);
            });
        });

        document.querySelectorAll(".titulo-produto").forEach(titulo => {
            titulo.addEventListener("click", (e) => {
                const idx = Number(e.currentTarget.dataset.index);
                abrirQuickView(produtosVisiveis[idx]);
            });
        });
    }

    /* ---------- Filtro por categoria + busca + ordenação combinados ---------- */

    function aplicarFiltrosCombinados() {
        const categoriaAtiva = document.querySelector(".filter-tab.active")?.dataset.filter || "all";
        const termoBusca = normalizar(searchInput ? searchInput.value : "");
        const ordenacao = sortSelect ? sortSelect.value : "padrao";

        let resultado = listaProdutos.filter(p => {
            if (categoriaAtiva === "favoritos") {
                return ehFavorito(p) && (!termoBusca || normalizar(p.nome).includes(termoBusca));
            }
            const passaCategoria = categoriaAtiva === "all" || normalizar(p.categoria) === normalizar(categoriaAtiva);
            const passaBusca = !termoBusca || normalizar(p.nome).includes(termoBusca);
            return passaCategoria && passaBusca;
        });

        const paraNumero = (preco) => {
            if (typeof preco === "number") return preco;
            const limpo = String(preco).replace(/[^\d,.-]/g, "").replace(".", "").replace(",", ".");
            return parseFloat(limpo) || 0;
        };

        if (ordenacao === "menor-preco") {
            resultado = [...resultado].sort((a, b) => paraNumero(a.preco) - paraNumero(b.preco));
        } else if (ordenacao === "maior-preco") {
            resultado = [...resultado].sort((a, b) => paraNumero(b.preco) - paraNumero(a.preco));
        }

        renderizarVitrine(resultado);
    }

    let timeoutBusca;
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            clearTimeout(timeoutBusca);
            timeoutBusca = setTimeout(aplicarFiltrosCombinados, 250); // debounce
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener("change", aplicarFiltrosCombinados);
    }

    filterTabs.forEach(tab => {
        tab.addEventListener("click", (e) => {
            filterTabs.forEach(t => t.classList.remove("active"));
            e.target.classList.add("active");
            aplicarFiltrosCombinados();
        });
    });

    /* ---------- Botões gerais ---------- */

    // "conta" leva para a área do cliente (cadastro/login), separada do
    // painel administrativo — o admin não é acessado por nenhum link
    // visível no site público.
    if (btnConta) {
        btnConta.addEventListener("click", () => {
            window.location.href = "conta.html";
        });
    }

    if (btnCoupon) {
        btnCoupon.addEventListener("click", () => mostrarToast("🎟️ Cupom liberado: CYBER10OFF (10% de desconto na primeira compra!).", "sucesso"));
    }

    if (btnAlert) {
        btnAlert.addEventListener("click", (e) => {
            e.preventDefault();
            window.location.href = "https://whatsapp.com/channel/0029vb8kcuf8f2plcfb4qb05";
        });
    }

    if (btnCart) {
        btnCart.addEventListener("click", abrirCarrinho);
    }

    atualizarContadorCarrinho();
    renderizarVistos();
    carregarProdutosDoBackend();
});
