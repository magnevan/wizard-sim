"""A small LZX decoder for XNA .xnb files (after MonoGame's LzxDecoder.cs / libmspack lzxd). Window 64 KB."""

PRETREE_NUM = 20
MAIN_MAXSYMBOLS = 256 + 50 * 8
LENGTH_NUM = 249
ALIGNED_NUM = 8
MIN_MATCH = 2
NUM_PRIMARY_LENGTHS = 7

EXTRA_BITS = [0, 0, 0, 0] + [i // 2 for i in range(2, 52)]
EXTRA_BITS = []
j = 0
for i in range(0, 51, 2):
    EXTRA_BITS += [j, j]
    if i != 0 and j < 17:
        j += 1
EXTRA_BITS = EXTRA_BITS[:52]
POSITION_BASE = []
j = 0
for i in range(51):
    POSITION_BASE.append(j)
    j += 1 << EXTRA_BITS[i]


class Bits:
    def __init__(self, data, pos=0):
        self.d = data; self.p = pos; self.buf = 0; self.n = 0

    def ensure(self, k):
        while self.n < k:
            lo = self.d[self.p] if self.p < len(self.d) else 0
            hi = self.d[self.p + 1] if self.p + 1 < len(self.d) else 0
            self.p += 2
            self.buf |= ((hi << 8) | lo) << (16 - self.n)  # 32-bit window, msb first
            self.buf &= 0xFFFFFFFF
            self.n += 16

    def peek(self, k):
        return (self.buf >> (32 - k)) & ((1 << k) - 1) if k else 0

    def remove(self, k):
        self.buf = (self.buf << k) & 0xFFFFFFFF; self.n -= k

    def read(self, k):
        if k == 0:
            return 0
        self.ensure(k); v = self.peek(k); self.remove(k); return v

    def align16(self):
        r = self.n % 16
        if r:
            self.remove(r)


def make_table(nsyms, nbits, lengths):
    """Canonical Huffman decode table: returns dict-free list table of size 1<<nbits with long-code fallbacks."""
    table = {}
    code = 0
    maxlen = max(lengths) if lengths else 0
    codes = []
    bl_count = [0] * 33
    for l in lengths:
        if l:
            bl_count[l] += 1
    next_code = [0] * 33
    c = 0
    for b in range(1, 33):
        c = (c + bl_count[b - 1]) << 1
        next_code[b] = c
    for sym, l in enumerate(lengths):
        if l:
            table[(l, next_code[l])] = sym
            next_code[l] += 1
    return table, maxlen


def read_sym(bits, tbl):
    table, maxlen = tbl
    bits.ensure(16 if maxlen <= 16 else 32)
    for l in range(1, maxlen + 1):
        c = bits.peek(l)
        s = table.get((l, c))
        if s is not None:
            bits.remove(l)
            return s
    raise ValueError('bad huffman code')


class LZX:
    def __init__(self, window_bits=16):
        self.wsize = 1 << window_bits
        self.win = bytearray(self.wsize)
        self.wpos = 0
        posn = {15: 30, 16: 32, 17: 34, 18: 36, 19: 38, 20: 42, 21: 50}[window_bits]
        self.main_elems = 256 + (posn << 3)
        self.r = [1, 1, 1]
        self.main_len = [0] * MAIN_MAXSYMBOLS
        self.len_len = [0] * LENGTH_NUM
        self.header_read = False
        self.block_remaining = 0
        self.block_type = 0
        self.intel = False

    def read_lengths(self, bits, lens, first, last):
        pre = [bits.read(4) for _ in range(PRETREE_NUM)]
        ptbl = make_table(PRETREE_NUM, 6, pre)
        x = first
        while x < last:
            z = read_sym(bits, ptbl)
            if z == 17:
                y = bits.read(4) + 4
                for _ in range(y):
                    lens[x] = 0; x += 1
            elif z == 18:
                y = bits.read(5) + 20
                for _ in range(y):
                    lens[x] = 0; x += 1
            elif z == 19:
                y = bits.read(1) + 4
                z = read_sym(bits, ptbl)
                z = (lens[x] - z) % 17
                for _ in range(y):
                    lens[x] = z; x += 1
            else:
                lens[x] = (lens[x] - z) % 17; x += 1

    def decompress(self, data, out_len):
        bits = Bits(data)
        out = bytearray()
        if not self.header_read:
            if bits.read(1):
                bits.read(16); bits.read(16)
            self.header_read = True
        togo = out_len
        win, wsize = self.win, self.wsize
        while togo > 0:
            if self.block_remaining == 0:
                if self.block_type == 3:
                    if self.block_len_odd:
                        bits.p += 1
                    bits = Bits(data, bits.p)  # realign after uncompressed block
                self.block_type = bits.read(3)
                hi = bits.read(16); lo = bits.read(8)
                self.block_remaining = self.block_length = (hi << 8) | lo
                if self.block_type == 2:
                    al = [bits.read(3) for _ in range(ALIGNED_NUM)]
                    self.aligned_tbl = make_table(ALIGNED_NUM, 7, al)
                if self.block_type in (1, 2):
                    self.read_lengths(bits, self.main_len, 0, 256)
                    self.read_lengths(bits, self.main_len, 256, self.main_elems)
                    self.main_tbl = make_table(self.main_elems, 12, self.main_len[:self.main_elems])
                    if self.main_len[0xE8]:
                        self.intel = True
                    self.read_lengths(bits, self.len_len, 0, LENGTH_NUM)
                    self.len_tbl = make_table(LENGTH_NUM, 12, self.len_len)
                elif self.block_type == 3:
                    self.intel = True
                    bits.ensure(16)
                    if bits.n > 16:
                        bits.p -= 2
                    # read the three R values raw from the byte stream
                    p = bits.p
                    self.r = [int.from_bytes(data[p:p + 4], 'little'), int.from_bytes(data[p + 4:p + 8], 'little'), int.from_bytes(data[p + 8:p + 12], 'little')]
                    bits.p = p + 12; bits.buf = 0; bits.n = 0
                    self.block_len_odd = self.block_length & 1
                else:
                    raise ValueError('bad block type %d' % self.block_type)
            this_run = min(self.block_remaining, togo)
            togo -= this_run
            self.block_remaining -= this_run
            wpos = self.wpos
            if self.block_type == 3:
                p = bits.p
                for _ in range(this_run):
                    win[wpos] = data[p]; p += 1; wpos = (wpos + 1) & (wsize - 1)
                    out.append(win[(wpos - 1) & (wsize - 1)])
                bits.p = p
                self.wpos = wpos
                continue
            while this_run > 0:
                mel = read_sym(bits, self.main_tbl)
                if mel < 256:
                    win[wpos] = mel; out.append(mel); wpos = (wpos + 1) & (wsize - 1); this_run -= 1
                    continue
                mel -= 256
                ml = mel & NUM_PRIMARY_LENGTHS
                if ml == NUM_PRIMARY_LENGTHS:
                    ml += read_sym(bits, self.len_tbl)
                ml += MIN_MATCH
                mo = mel >> 3
                if mo > 2:
                    if self.block_type == 2 and EXTRA_BITS[mo] >= 3:
                        extra = EXTRA_BITS[mo]
                        mo = POSITION_BASE[mo] - 2
                        if extra > 3:
                            mo += bits.read(extra - 3) << 3
                        mo += read_sym(bits, self.aligned_tbl)
                    elif self.block_type == 2 and EXTRA_BITS[mo] > 0:
                        mo = POSITION_BASE[mo] - 2 + bits.read(EXTRA_BITS[mo])
                    elif self.block_type == 2:
                        mo = 1
                    else:
                        extra = EXTRA_BITS[mo]
                        mo = POSITION_BASE[mo] - 2 + (bits.read(extra) if extra else 0)
                    self.r = [mo, self.r[0], self.r[1]]
                elif mo == 0:
                    mo = self.r[0]
                elif mo == 1:
                    mo = self.r[1]; self.r = [mo, self.r[0], self.r[2]]
                else:
                    mo = self.r[2]; self.r = [mo, self.r[1], self.r[0]]
                this_run -= ml
                src = (wpos - mo) & (wsize - 1)
                for _ in range(ml):
                    b = win[src]; win[wpos] = b; out.append(b)
                    wpos = (wpos + 1) & (wsize - 1); src = (src + 1) & (wsize - 1)
            self.wpos = wpos
        return bytes(out)


def xnb_payload(raw):
    """The decompressed body of an .xnb file (after its 10-byte header)."""
    assert raw[:3] == b'XNB', 'not an xnb'
    flags = raw[5]
    if not flags & 0x80:
        return raw[10:]
    out_size = int.from_bytes(raw[10:14], 'little')
    p = 14
    dec = LZX(16)
    out = bytearray()
    while p < len(raw) and len(out) < out_size:
        hi = raw[p]; lo = raw[p + 1]; p += 2
        if hi == 0xFF:
            frame = (lo << 8) | raw[p]; block = (raw[p + 1] << 8) | raw[p + 2]; p += 3
        else:
            block = (hi << 8) | lo; frame = 0x8000
        if block == 0 or frame == 0:
            break
        out += dec.decompress(raw[p:p + block], frame)
        p += block
    return bytes(out[:out_size])
