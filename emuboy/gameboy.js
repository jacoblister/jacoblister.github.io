class Interrupt {
    IME;
    IE;
    IF;
    reset() {
        this.IME = 0;
        this.IE = 0;
        this.IF = 0;
    }
    constructor() {
        this.reset();
    }
}

class Timer {
    interrupt;
    ticks;
    DIV;
    TIMA;
    TMA;
    TAC;
    reset() {
        this.DIV = 0;
        this.TIMA = 0;
        this.TMA = 0;
        this.TAC = 0xF8;
    }
    constructor(interrupt) {
        this.interrupt = interrupt;
        this.ticks = 0;
        this.reset();
    }
    tick() {
        let mask = (1 << ((((this.TAC + 3) & 0x03) << 1) + 4)) - 1;
        this.ticks = (this.ticks + 1) & 0xFFFF;
        if ((this.ticks & 0xFF) == 0) {
            this.DIV = (this.DIV + 1) & 0xFF;
        }
        if (this.TAC & (1 << 2) && (this.ticks & mask) == 0) {
            this.TIMA = (this.TIMA + 1) & 0xFF;
            if (this.TIMA == 0) {
                this.TIMA = this.TMA;
                this.interrupt.IF = this.interrupt.IF | 4;
            }
        }
    }
}

class ROM {
    data;
    constructor() {
        this.data = [];
        for (let i = 0; i < 0x8000; i = i + 1) {
            this.data.push(0x00);
        }
    }
}

class RAM {
    WRAM;
    XRAM;
    HRAM;
    constructor() {
        this.WRAM = [];
        for (let i = 0; i < 0x2000; i = i + 1) {
            this.WRAM.push(0xFF);
        }
        this.XRAM = [];
        for (let i = 0; i < 0x8000; i = i + 1) {
            this.XRAM.push(0xFF);
        }
        this.HRAM = [];
        for (let i = 0; i < 0x80; i = i + 1) {
            this.HRAM.push(0xFF);
        }
    }
}

// import * as ppuData from "./test/ppuDataTennis"
class PPU {
    vBuffer;
    vBufferIndex;
    interrupt;
    interruptLine;
    VRAM;
    OAM;
    LCDC;
    STAT;
    LY;
    LYC;
    SCY;
    SCX;
    WY;
    WX;
    WLY;
    bgPixelIndex;
    bgTileMap;
    bgTileMapIndex;
    bgTileLine;
    bgTileLineData;
    secOAM;
    palette;
    BGP;
    OBP0;
    OBP1;
    ticks;
    frame;
    reset() {
        this.interruptLine = 0;
        this.LCDC = 0x91;
        this.STAT = 0x81;
        this.LY = 0x91;
        this.SCY = 0;
        this.SCX = 0;
        this.WY = 0;
        this.WX = 0;
        this.WLY = 0x90;
        this.BGP = 0xFC;
        this.OBP0 = 0xFF;
        this.OBP1 = 0xFF;
        this.ticks = 216;
        this.frame = 0;
    }
    constructor(interrupt) {
        this.vBuffer = [];
        for (let i = 0; i < 23040; i = i + 1) {
            this.vBuffer.push(0);
        }
        this.vBufferIndex = 0;
        this.interrupt = interrupt;
        this.VRAM = [];
        for (let i = 0; i < 0x2000; i = i + 1) {
            this.VRAM.push(0);
        }
        // this.VRAM = ppuData.VRAMData()
        this.OAM = [];
        for (let i = 0; i < 160; i = i + 1) {
            this.OAM.push(0);
        }
        this.secOAM = [];
        for (let i = 0; i < 10; i = i + 1) {
            this.secOAM.push(0);
        }
        this.palette = [];
        for (let i = 0; i < 3; i = i + 1) {
            let palette = [];
            palette.push(0xFFFFFFFF);
            palette.push(0xFFFFFFFF);
            palette.push(0xFFFFFFFF);
            palette.push(0xFFFFFFFF);
            this.palette.push(palette);
        }
        this.palette[0][0] = 0xFF000000;
        this.reset();
    }
    dmgPaletteSet(palNo, data) {
        if (palNo == 0) {
            this.BGP = data;
        }
        if (palNo == 1) {
            this.OBP0 = data;
        }
        if (palNo == 2) {
            this.OBP1 = data;
        }
        for (let i = 0; i < 4; i = i + 1) {
            let rgb = 0xFF000000;
            let shade = 3 - ((data >> (i << 1)) & 3);
            for (let j = 0; j < 12; j = j + 1) {
                rgb = rgb | (shade << (j << 1));
            }
            this.palette[palNo][i] = rgb;
        }
    }
    LCDCSet(data) {
        if ((data & 0x80) != (this.LCDC & 0x80)) {
            if (data & 0x80) {
                this.LY = 144;
                this.STAT = this.STAT & 0x78 | 1;
            }
            else {
                this.LY = 0;
                this.STAT = this.STAT & 0x78;
            }
        }
        this.LCDC = data;
    }
    fetchTileLineData(tileNumber, line, bgAddressingMode, hFlip) {
        if (bgAddressingMode) {
            if (tileNumber > 127) {
                tileNumber = 0 - (0x100 - tileNumber);
            }
            tileNumber = tileNumber + 0x100;
        }
        let vramIndex = (tileNumber << 4) + (line & 7) * 2;
        let data = 0;
        for (let i = 0; i < 8; i = i + 1) {
            let pixel = ((this.VRAM[vramIndex] >> i) & 1) | (((this.VRAM[vramIndex + 1] >> i) & 1) << 1);
            let pixelIndex = hFlip ? 7 - i : i;
            data = data | (pixel << (pixelIndex << 1));
        }
        return data;
    }
    nextFrame() {
        this.vBufferIndex = 0;
    }
    oamScan() {
        for (let i = 0; i < 10; i = i + 1) {
            this.secOAM[i] = 0;
        }
        let secOAMIndex = 0;
        for (let i = 0; i < 40; i = i + 1) {
            let oamLine = this.LY - (this.OAM[i << 2] - 16);
            let objSize = 8;
            let tileBase = this.OAM[(i << 2) + 2];
            if (this.LCDC & 4) {
                objSize = 16;
                tileBase = tileBase & 0xFE;
            }
            if (oamLine >= 0 && oamLine < objSize) {
                if (secOAMIndex < 10) {
                    let hFlip = this.OAM[(i << 2) + 3] & 0x20 ? 1 : 0;
                    let line = this.OAM[(i << 2) + 3] & 0x40 ? (objSize - 1) - oamLine : oamLine;
                    let tileOffset = 0;
                    if (line >= 8) {
                        line = line - 8;
                        tileOffset = 1;
                    }
                    this.secOAM[secOAMIndex] = this.fetchTileLineData(tileBase + tileOffset, line, 0, hFlip);
                    this.secOAM[secOAMIndex] = this.secOAM[secOAMIndex] | (this.OAM[(i << 2) + 1] << 16) | (this.OAM[(i << 2) + 3] << 24);
                    secOAMIndex = secOAMIndex + 1;
                }
            }
        }
    }
    nextBGTile() {
        if (this.ticks == 160) {
            this.bgPixelIndex = 7 - (this.SCX & 7);
            this.bgTileMap = this.LCDC & 0x08 ? 0x1C00 : 0x1800;
            this.bgTileMapIndex = ((this.SCX >> 3) & 0x1F) | ((((this.LY + this.SCY) >> 3) & 0x1F) << 5);
            this.bgTileLine = (this.LY + this.SCY) & 7;
        }
        if (this.LCDC & 0x20 && this.LY >= this.WY) {
            let active = 0;
            if (this.ticks == 160 && this.WX < 7) {
                this.bgPixelIndex = this.WX;
                active = 1;
            }
            if (167 - this.ticks == this.WX) {
                this.bgPixelIndex = 7;
                active = 1;
            }
            if (active) {
                this.bgTileMap = this.LCDC & 0x40 ? 0x1C00 : 0x1800;
                this.bgTileMapIndex = ((0 >> 3) & 0x1F) | (((this.WLY >> 3) & 0x1F) << 5);
                this.bgTileLine = this.WLY & 7;
            }
        }
        if (this.bgPixelIndex == 7 || this.ticks == 160) {
            this.bgTileLineData = this.fetchTileLineData(this.VRAM[this.bgTileMap + this.bgTileMapIndex], this.bgTileLine, this.LCDC & 0x10 ? 0 : 1, 0);
        }
        if (this.bgPixelIndex == 0) {
            this.bgTileMapIndex = (this.bgTileMapIndex & 0x3E0) | ((this.bgTileMapIndex + 1) & 0x1F);
        }
    }
    nextPixel() {
        let bgPixel = 0;
        if (this.LCDC & 0x01) {
            bgPixel = (this.bgTileLineData >> (this.bgPixelIndex << 1)) & 3;
        }
        let oamPixel = 0;
        let oamPalette = 0;
        let oamXMin = 168;
        if (this.LCDC & 0x02) {
            for (let i = 0; i < 10; i = i + 1) {
                let oamX = (this.secOAM[i] >> 16) & 0xFF;
                let oamCol = (160 - this.ticks) - (oamX - 8);
                if (oamCol >= 0 && oamCol < 8) {
                    let priority = oamPixel == 0 ? 1 : 0;
                    if (oamX < oamXMin) {
                        oamXMin = oamX;
                        priority = 1;
                    }
                    if (this.secOAM[i] & (1 << 31) && bgPixel > 0) {
                        priority = 0;
                    }
                    let secPixel = (this.secOAM[i] >> ((7 - oamCol) << 1)) & 3;
                    if (secPixel != 0 && priority) {
                        oamPixel = secPixel;
                        oamPalette = this.secOAM[i] & (1 << 28) ? 2 : 1;
                    }
                }
            }
        }
        let pixel = this.palette[0][bgPixel];
        if (oamPixel != 0) {
            pixel = this.palette[oamPalette][oamPixel];
        }
        this.vBuffer[this.vBufferIndex] = pixel;
        if ((this.LCDC & 0x80) == 0) {
            this.vBuffer[this.vBufferIndex] = 0xFFFFFFFF;
        }
        this.bgPixelIndex = (this.bgPixelIndex + 7) & 7;
        this.vBufferIndex = this.vBufferIndex + 1;
    }
    tick() {
        if ((this.LCDC & (1 << 7)) == 0) {
            return;
        }
        if ((this.STAT & 3) == 2 && this.LY == 0 && this.ticks == 1) {
            this.nextFrame();
        }
        if ((this.STAT & 3) == 2 && this.ticks == 1) {
            this.oamScan();
        }
        if ((this.STAT & 3) == 3) {
            this.nextBGTile();
            this.nextPixel();
        }
        this.ticks = this.ticks - 1;
        if (this.ticks == 0) {
            if ((this.STAT & 3) == 0) {
                this.LY = this.LY + 1;
                if (this.LY == this.WY) {
                    this.WLY = 0;
                }
                else if (this.LCDC & 0x20 && (this.WX <= 166 && this.WY <= 143)) {
                    this.WLY = this.WLY + 1;
                }
                if (this.LY == 144) {
                    this.STAT = (this.STAT & 0xFC) | 1;
                    this.ticks = 456;
                }
                else {
                    this.STAT = (this.STAT & 0xFC) | 2;
                    this.ticks = 80;
                }
            }
            else if ((this.STAT & 3) == 1) {
                this.LY = this.LY + 1;
                if (this.LY == 154) {
                    this.STAT = (this.STAT & 0xFC) | 2;
                    this.LY = 0;
                    this.WLY = 0;
                    this.ticks = 80;
                    this.frame = 1;
                }
                else {
                    this.ticks = 456;
                }
            }
            else if ((this.STAT & 3) == 2) {
                this.ticks = 160;
                this.STAT = (this.STAT & 0xFC) | 3;
            }
            else if ((this.STAT & 3) == 3) {
                this.ticks = 216;
                this.STAT = (this.STAT & 0xFC) | 0;
            }
            this.STAT = this.STAT & 0xFB | (this.LY == this.LYC ? 4 : 0);
        }
        if ((this.STAT & 3) == 1 && this.LY == 144 && this.ticks == 416) {
            this.interrupt.IF = this.interrupt.IF | 1;
        }
        let intLYC = (this.STAT & 3) != 0 && this.LY == this.LYC && (this.STAT & (1 << 6)) ? 1 : 0;
        let intHBlank = (this.STAT & 3) == 0 && this.ticks < 200 && (this.STAT & (1 << 3)) ? 1 : 0;
        let interruptLine = intLYC | intHBlank;
        if (interruptLine && interruptLine != this.interruptLine) {
            this.interrupt.IF = this.interrupt.IF | 2;
        }
        this.interruptLine = interruptLine;
    }
}

class ChanPulse {
    on;
    wave;
    NR0;
    NR1;
    NR2;
    NR3;
    NR4;
    div;
    divSweep;
    divEnv;
    phase;
    length;
    vol;
    PCM;
    reset() {
        this.on = 0;
        this.NR0 = 0;
        this.NR1 = 0;
        this.NR2 = 0;
        this.NR3 = 0;
        this.NR4 = 0;
        this.div = 0;
        this.divSweep = 0;
        this.divEnv = 0;
        this.phase = 0;
        this.length = 0;
        this.vol = 0;
        this.PCM = 0;
    }
    constructor() {
        this.wave = [0xFE, 0x7E, 0x78, 0x81];
        this.reset();
    }
    zombieVolume(data) {
        // if (!(this.NR2 & 7) && this.vol) {
        //     this.vol = this.vol + 1
        // }
        // else if (!(this.NR2 & 8)) {
        //     this.vol = this.vol + 2
        // }
        // if ((this.NR2 ^ data) & 8) {
        //     this.vol = 16 - this.vol
        // }
        // this.vol = this.vol & 0x0F
        this.vol = data >> 4;
    }
    volume(data) {
        // this.zombieVolume(data)
        this.NR2 = data;
        if ((data & 0xF0) == 0) {
            this.PCM = 0;
            this.on = 0;
        }
    }
    trigger(data) {
        this.NR4 = data;
        this.length = this.NR4 & (1 << 6) ? 63 - (this.NR1 & 63) : 0;
        if (data & (1 << 7)) {
            this.on = 1;
            this.vol = this.NR2 >> 4;
            this.divSweep = (this.NR0 >> 4) & 7;
            this.divEnv = this.NR2 & 7;
        }
    }
    tick(DIVAPUEdge) {
        if (!this.on) {
            return;
        }
        if (this.div == 0) {
            let period = ((this.NR4 & 0x07) << 8) | this.NR3;
            this.div = 2048 - period;
            if (period == 2047) {
                this.PCM = 0x0F;
            }
            else {
                this.phase = (this.phase + 1) & 7;
                this.PCM = (this.wave[this.NR1 >> 6] >> this.phase) & 1 ? this.vol : 0;
            }
        }
        this.div = this.div - 1;
        if (DIVAPUEdge & (1 << 1) && (this.NR0 >> 4) & 7) {
            if (this.divSweep == 0) {
                let period = ((this.NR4 & 0x07) << 8) | this.NR3;
                let change = period / (1 << (this.NR0 & 7));
                if (this.NR0 & (1 << 3)) {
                    period = period - change;
                }
                else {
                    period = period + change;
                }
                if (period < 0 || period > 0x7FF) {
                    this.PCM = 0;
                    this.on = 0;
                }
                else {
                    this.NR3 = period & 0xFF;
                    this.NR4 = (this.NR4 & 0xF8) | period >> 8;
                }
                this.divSweep = (this.NR0 >> 4) & 7;
            }
            else {
                this.divSweep = this.divSweep - 1;
            }
        }
        if (DIVAPUEdge & (1 << 2) && this.NR2 & 7) {
            if (this.divEnv == 0) {
                if (this.NR2 & (1 << 3)) {
                    if (this.vol < 0xF) {
                        this.vol = this.vol + 1;
                    }
                }
                else {
                    if (this.vol > 0x0) {
                        this.vol = this.vol - 1;
                    }
                }
                this.divEnv = (this.NR2 & 7) + 1;
            }
            else {
                this.divEnv = this.divEnv - 1;
            }
        }
        if ((DIVAPUEdge & 1) && this.length) {
            this.length = this.length - 1;
            if (this.length == 0) {
                this.PCM = 0;
                this.on = 0;
            }
        }
    }
}
class ChanWave {
    on;
    wave;
    NR0;
    NR1;
    NR2;
    NR3;
    NR4;
    div;
    phase;
    length;
    PCM;
    reset() {
        this.on = 0;
        this.NR0 = 0;
        this.NR1 = 0;
        this.NR2 = 0;
        this.NR3 = 0;
        this.NR4 = 0;
        this.div = 0;
        this.phase = 0;
        this.PCM = 0;
    }
    constructor() {
        this.wave = [];
        for (let i = 0; i < 16; i = i + 1) {
            this.wave.push(0x00);
        }
        this.reset();
    }
    trigger(data) {
        this.NR4 = data;
        this.length = this.NR4 & (1 << 6) ? 63 - (this.NR1 & 63) : 0;
        if (data & (1 << 7)) {
            this.phase = 0;
            this.on = 1;
        }
    }
    tick(DIVAPUEdge) {
        if (!this.on) {
            return;
        }
        if (this.div == 0) {
            let period = ((this.NR4 & 0x07) << 8) | this.NR3;
            this.div = 2048 - period;
            this.phase = (this.phase + 1) & 31;
            let shift = 4;
            if (this.on && this.NR0 & (1 << 7) && (this.NR2 >> 5) & 3) {
                shift = ((this.NR2 >> 5) & 3) - 1;
            }
            this.PCM = ((this.wave[this.phase >> 1] >> (this.phase & 1 ? 0 : 4)) & 0x0F) >> shift;
        }
        this.div = this.div - 1;
        if ((DIVAPUEdge & 1) && this.length) {
            this.length = this.length - 1;
            if (this.length == 0) {
                this.PCM = 0;
                this.on = 0;
            }
        }
    }
}
class ChanNoise {
    on;
    NR1;
    NR2;
    NR3;
    NR4;
    LSFR;
    div;
    phase;
    divEnv;
    length;
    vol;
    PCM;
    reset() {
        this.on = 0;
        this.NR1 = 0;
        this.NR2 = 0;
        this.NR3 = 0;
        this.NR4 = 0;
        this.LSFR = 0;
        this.div = 0;
        this.phase = 0;
        this.length = 0;
        this.vol = 0;
        this.PCM = 0;
    }
    constructor() {
        this.reset();
    }
    volume(data) {
        this.NR2 = data;
        if ((data & 0xF0) == 0) {
            this.PCM = 0;
            this.on = 0;
        }
    }
    trigger(data) {
        this.NR4 = data;
        this.length = this.NR4 & (1 << 6) ? 63 - (this.NR1 & 63) : 0;
        if (data & (1 << 7)) {
            this.on = 1;
            this.vol = this.NR2 >> 4;
            this.divEnv = this.NR2 & 7;
        }
    }
    tick(DIVAPUEdge) {
        if (!this.on) {
            return;
        }
        if (this.div == 0) {
            this.div = (this.NR3 & 7) << 1;
            if (this.div == 0) {
                this.div = 1;
            }
            this.div = this.div << ((this.NR3 >> 4) & 0x0F);
            this.PCM = this.LSFR & 1 ? this.vol : 0;
            let x = ((this.LSFR & 1) == ((this.LSFR >> 1) & 1)) ? 1 : 0;
            this.LSFR = this.LSFR | x << 15;
            if (this.NR3 & (1 << 3)) {
                this.LSFR = this.LSFR & 0xFF7F | x << 7;
            }
            this.LSFR = this.LSFR >> 1;
        }
        this.div = this.div - 1;
        if (DIVAPUEdge & (1 << 2) && this.NR2 & 7) {
            if (this.divEnv == 0) {
                if (this.NR2 & (1 << 3)) {
                    if (this.vol < 0xF) {
                        this.vol = this.vol + 1;
                    }
                }
                else {
                    if (this.vol > 0x0) {
                        this.vol = this.vol - 1;
                    }
                }
                this.divEnv = (this.NR2 & 7) + 1;
            }
            else {
                this.divEnv = this.divEnv - 1;
            }
        }
        if ((DIVAPUEdge & 1) && this.length) {
            this.length = this.length - 1;
            if (this.length == 0) {
                this.PCM = 0;
                this.on = 0;
            }
        }
    }
}
class APU {
    ticks;
    DIVAPU;
    channel1;
    channel2;
    channel3;
    channel4;
    NR50;
    NR51;
    NR52;
    PCM12;
    PCM34;
    PCML;
    PCMR;
    reset() {
        this.NR50 = 0x77;
        this.NR51 = 0xF3;
        this.NR52 = 0xF1;
        this.PCM12 = 0;
        this.PCM34 = 0;
        this.PCML = 0;
        this.PCMR = 0;
    }
    constructor() {
        this.ticks = 0;
        this.DIVAPU = 0;
        this.channel1 = new ChanPulse();
        this.channel2 = new ChanPulse();
        this.channel3 = new ChanWave();
        this.channel4 = new ChanNoise();
        this.reset();
    }
    read(addr) {
        if (addr == 0xFF10) {
            return this.channel1.NR0 | 0x80;
        }
        if (addr == 0xFF11) {
            return this.channel1.NR1 | 0x3F;
        }
        if (addr == 0xFF12) {
            return this.channel1.NR2;
        }
        if (addr == 0xFF13) {
            return 0xFF;
        }
        if (addr == 0xFF14) {
            return this.channel1.NR4 | 0xBF;
        }
        if (addr == 0xFF15) {
            return 0xFF;
        }
        if (addr == 0xFF16) {
            return this.channel2.NR1 | 0x3F;
        }
        if (addr == 0xFF17) {
            return this.channel2.NR2;
        }
        if (addr == 0xFF18) {
            return 0xFF;
        }
        if (addr == 0xFF19) {
            return this.channel2.NR4 | 0xBF;
        }
        if (addr == 0xFF1A) {
            return this.channel3.NR0 | 0x7F;
        }
        if (addr == 0xFF1B) {
            return 0xFF;
        }
        if (addr == 0xFF1C) {
            return this.channel3.NR2 | 0x9F;
        }
        if (addr == 0xFF1D) {
            return 0xFF;
        }
        if (addr == 0xFF1E) {
            return this.channel3.NR4 | 0xBF;
        }
        if (addr == 0xFF1F) {
            return 0xFF;
        }
        if (addr == 0xFF20) {
            return 0xFF;
        }
        if (addr == 0xFF21) {
            return this.channel4.NR2;
        }
        if (addr == 0xFF22) {
            return this.channel4.NR3;
        }
        if (addr == 0xFF23) {
            return this.channel4.NR4 | 0xBF;
        }
        if (addr == 0xFF24) {
            return this.NR50;
        }
        if (addr == 0xFF25) {
            return this.NR51;
        }
        if (addr == 0xFF26) {
            return this.NR52 | 0x70;
        }
        if (addr >= 0xFF27 && addr < 0xFF30) {
            return 0xFF;
        }
        if (addr >= 0xFF30 && addr <= 0xFF3F) {
            return this.channel3.wave[addr - 0xFF30];
        }
        return 0;
    }
    write(addr, data) {
        if ((this.NR52 & 0x80) == 0 && addr != 0xFF26) {
            return;
        }
        if (addr == 0xFF10) {
            this.channel1.NR0 = data;
        }
        if (addr == 0xFF11) {
            this.channel1.NR1 = data;
        }
        if (addr == 0xFF12) {
            this.channel1.volume(data);
        }
        if (addr == 0xFF13) {
            this.channel1.NR3 = data;
        }
        if (addr == 0xFF14) {
            this.channel1.trigger(data);
        }
        if (addr == 0xFF15) {
            this.channel2.NR0 = data;
        }
        if (addr == 0xFF16) {
            this.channel2.NR1 = data;
        }
        if (addr == 0xFF17) {
            this.channel2.volume(data);
        }
        if (addr == 0xFF18) {
            this.channel2.NR3 = data;
        }
        if (addr == 0xFF19) {
            this.channel2.trigger(data);
        }
        if (addr == 0xFF1A) {
            this.channel3.NR0 = data;
        }
        if (addr == 0xFF1B) {
            this.channel3.NR1 = data;
        }
        if (addr == 0xFF1C) {
            this.channel3.NR2 = data;
        }
        if (addr == 0xFF1D) {
            this.channel3.NR3 = data;
        }
        if (addr == 0xFF1E) {
            this.channel3.trigger(data);
        }
        if (addr == 0xFF20) {
            this.channel4.NR1 = data;
        }
        if (addr == 0xFF21) {
            this.channel4.volume(data);
        }
        if (addr == 0xFF22) {
            this.channel4.NR3 = data;
        }
        if (addr == 0xFF23) {
            this.channel4.trigger(data);
        }
        if (addr == 0xFF24) {
            this.NR50 = data;
        }
        if (addr == 0xFF25) {
            this.NR51 = data;
        }
        if (addr == 0xFF26) {
            this.NR52 = (this.NR52 & 0x0F) | (data & 0xF0);
            if ((data & 0x80) == 0) {
                this.channel1.reset();
                this.channel2.reset();
                this.channel3.reset();
                this.channel4.reset();
                this.reset();
            }
        }
        if (addr >= 0xFF30 && addr <= 0xFF3F) {
            this.channel3.wave[addr - 0xFF30] = data;
        }
    }
    tick() {
        let ticksNext = (this.ticks + 1) & 0x1FFF;
        let ticksEdge = (this.ticks ^ ticksNext) & this.ticks;
        this.ticks = ticksNext;
        let DIVAPUEdge = 0;
        if (this.ticks == 0) {
            let DIVAPUNext = (this.DIVAPU + 1) & 0xFF;
            DIVAPUEdge = (this.DIVAPU ^ DIVAPUNext) & this.DIVAPU;
            this.DIVAPU = DIVAPUNext;
        }
        if (ticksEdge & 2) {
            this.channel1.tick(DIVAPUEdge);
            this.channel2.tick(DIVAPUEdge);
        }
        if (ticksEdge & 1) {
            this.channel3.tick(DIVAPUEdge);
        }
        if (ticksEdge & 8) {
            this.channel4.tick(DIVAPUEdge);
        }
        this.NR52 = (this.NR52 & 0x80) | this.channel4.on << 3 | this.channel3.on << 2 | this.channel2.on << 1 | this.channel1.on;
        // this.PCM12 = this.channel1.PCM
        // this.PCM34 = this.channel2.PCM
        this.PCML = 0;
        this.PCMR = 0;
        if (this.NR51 & (1 << 0)) {
            this.PCMR = this.PCMR + this.channel1.PCM;
        }
        if (this.NR51 & (1 << 1)) {
            this.PCMR = this.PCMR + this.channel2.PCM;
        }
        if (this.NR51 & (1 << 2)) {
            this.PCMR = this.PCMR + this.channel3.PCM;
        }
        if (this.NR51 & (1 << 3)) {
            this.PCMR = this.PCMR + this.channel4.PCM;
        }
        if (this.NR51 & (1 << 4)) {
            this.PCML = this.PCML + this.channel1.PCM;
        }
        if (this.NR51 & (1 << 5)) {
            this.PCML = this.PCML + this.channel2.PCM;
        }
        if (this.NR51 & (1 << 6)) {
            this.PCML = this.PCML + this.channel3.PCM;
        }
        if (this.NR51 & (1 << 7)) {
            this.PCML = this.PCML + this.channel4.PCM;
        }
    }
}

class GamePad {
    buttonState;
    buttonSelect;
    constructor() {
        this.buttonState = 0xFF;
    }
    select(data) {
        this.buttonSelect = data;
    }
    read() {
        if ((this.buttonSelect & 0x20) == 0) {
            return 0x0F & (this.buttonState >> 4);
        }
        if ((this.buttonSelect & 0x10) == 0) {
            return 0x0F & (this.buttonState & 0x0F);
        }
        return 0xFF;
    }
    buttonEvent(buttonIndex, buttonDown) {
        if (buttonDown) {
            this.buttonState = this.buttonState & ((1 << buttonIndex) ^ 0xFF);
        }
        else {
            this.buttonState = this.buttonState | (1 << buttonIndex);
        }
    }
}

class Mapper {
    timer;
    rom;
    ram;
    ppu;
    apu;
    gamepad;
    interrupt;
    romBank;
    ramBank;
    dmaSrc;
    dmaDst;
    dmaCount;
    reset() {
        this.romBank = 1;
        this.ramBank = 0;
        this.dmaSrc = 0;
        this.dmaDst = 0;
        this.dmaCount = 0;
    }
    constructor(timer, rom, ram, ppu, apu, gamepad, interrupt) {
        this.timer = timer;
        this.rom = rom;
        this.ram = ram;
        this.ppu = ppu;
        this.apu = apu;
        this.gamepad = gamepad;
        this.interrupt = interrupt;
        this.reset();
    }
    read(addr) {
        if (addr >= 0x0000 && addr < 0x4000) {
            return this.rom.data[addr];
        }
        if (addr >= 0x4000 && addr < 0x8000) {
            return this.rom.data[(addr & 0x3FFF) + (this.romBank << 14)];
        }
        if (addr >= 0x8000 && addr < 0xA000) {
            return this.ppu.VRAM[addr - 0x8000];
        }
        if (addr >= 0xA000 && addr < 0xC000) {
            return this.ram.XRAM[(addr & 0x1FFF) + (this.ramBank << 13)];
        }
        if (addr >= 0xC000 && addr < 0xE000) {
            return this.ram.WRAM[addr - 0xC000];
        }
        // if (addr >= 0xE000 && addr < 0xFE00) { return this.ram.WRAM[addr - 0xE000] }
        if (addr == 0xFF00) {
            return this.gamepad.read();
        }
        if (addr == 0xFF01) {
            return 0;
        }
        if (addr == 0xFF02) {
            return 0;
        }
        if (addr == 0xFF04) {
            return this.timer.DIV;
        }
        if (addr == 0xFF05) {
            return this.timer.TIMA;
        }
        if (addr == 0xFF06) {
            return this.timer.TMA;
        }
        if (addr == 0xFF07) {
            return this.timer.TAC;
        }
        if (addr == 0xFF0F) {
            return this.interrupt.IF;
        }
        if (addr >= 0xFF10 && addr <= 0xFF3F) {
            return this.apu.read(addr);
        }
        if (addr == 0xFF40) {
            return this.ppu.LCDC;
        }
        if (addr == 0xFF41) {
            return this.ppu.STAT;
        }
        if (addr == 0xFF42) {
            return this.ppu.SCY;
        }
        if (addr == 0xFF43) {
            return this.ppu.SCX;
        }
        if (addr == 0xFF44) {
            return this.ppu.LY;
        }
        if (addr == 0xFF45) {
            return this.ppu.LYC;
        }
        if (addr == 0xFF47) {
            return this.ppu.BGP;
        }
        if (addr == 0xFF48) {
            return this.ppu.OBP0;
        }
        if (addr == 0xFF49) {
            return this.ppu.OBP1;
        }
        if (addr == 0xFF4A) {
            return this.ppu.WY;
        }
        if (addr == 0xFF4B) {
            return this.ppu.WX;
        }
        if (addr >= 0xFF80 && addr <= 0xFFFE) {
            return this.ram.HRAM[addr - 0xFF80];
        }
        if (addr == 0xFFFF) {
            return this.interrupt.IE;
        }
        console.log("READ FAIL");
        console.log(addr);
        return 0;
    }
    write(addr, data) {
        if (addr >= 0x2000 && addr < 0x4000) {
            this.romBank = data;
            // this.romBank = data & 0x1F
            // this.romBank = (this.romBank & 0xE0) | (data & 0x1F)
            if (this.romBank == 0) {
                this.romBank = 1;
            }
        }
        if (addr >= 0x4000 && addr < 0x6000) {
            // this.romBank = (this.romBank & 0x1F) | (data & 3) << 5
            this.ramBank = data & 0x03;
        }
        if (addr >= 0x6000 && addr < 0x8000) {
            console.log("Bank Switch Mode Select");
            console.log(addr);
            console.log(data);
        }
        if (addr >= 0x8000 && addr < 0xA000) {
            this.ppu.VRAM[addr - 0x8000] = data;
        }
        if (addr >= 0xA000 && addr < 0xC000) {
            this.ram.XRAM[(addr & 0x1FFF) + (this.ramBank << 13)] = data;
        }
        if (addr >= 0xC000 && addr < 0xE000) {
            this.ram.WRAM[addr - 0xC000] = data;
        }
        if (addr >= 0xE000 && addr < 0xFE00) {
            console.log("Echo RAM write");
        }
        if (addr >= 0xFE00 && addr <= 0xFE9F) {
            this.ppu.OAM[addr - 0xFE00] = data;
        }
        if (addr == 0xFF00) {
            this.gamepad.select(data);
        }
        if (addr == 0xFF04) {
            this.timer.DIV = data;
        }
        if (addr == 0xFF05) {
            this.timer.TIMA = data;
        }
        if (addr == 0xFF06) {
            this.timer.TMA = data;
        }
        if (addr == 0xFF07) {
            this.timer.TAC = data;
        }
        if (addr == 0xFF0F) {
            this.interrupt.IF = data;
        }
        if (addr >= 0xFF10 && addr <= 0xFF3F) {
            return this.apu.write(addr, data);
        }
        if (addr == 0xFF40) {
            this.ppu.LCDCSet(data);
        }
        if (addr == 0xFF41) {
            this.ppu.STAT = (this.ppu.STAT & 0x07) | (data & 0xF8);
        }
        if (addr == 0xFF42) {
            this.ppu.SCY = data;
        }
        if (addr == 0xFF43) {
            this.ppu.SCX = data;
        }
        if (addr == 0xFF45) {
            this.ppu.LYC = data;
        }
        if (addr == 0xFF46) {
            this.dmaSrc = data << 8;
            this.dmaDst = 0xFE00;
            this.dmaCount = 160;
        }
        if (addr == 0xFF47) {
            this.ppu.dmgPaletteSet(0, data);
        }
        if (addr == 0xFF48) {
            this.ppu.dmgPaletteSet(1, data);
        }
        if (addr == 0xFF49) {
            this.ppu.dmgPaletteSet(2, data);
        }
        if (addr == 0xFF4A) {
            this.ppu.WY = data;
        }
        if (addr == 0xFF4B) {
            this.ppu.WX = data;
        }
        if (addr >= 0xFF80 && addr <= 0xFFFE) {
            this.ram.HRAM[addr - 0xFF80] = data;
        }
        if (addr == 0xFFFF) {
            this.interrupt.IE = data;
        }
    }
    tick() {
        if (this.dmaCount) {
            this.write(this.dmaDst, this.read(this.dmaSrc));
            this.dmaSrc = this.dmaSrc + 1;
            this.dmaDst = this.dmaDst + 1;
            this.dmaCount = this.dmaCount - 1;
        }
    }
}

let _B = 0;
let _C = 1;
let _D = 2;
let _E = 3;
let _H = 4;
let _L = 5;
let _F = 6;
let _A = 7;
let _HL = _F;
let FLAG_Z = (1 << 7);
let FLAG_N = (1 << 6);
let FLAG_H = (1 << 5);
let FLAG_C = (1 << 4);
class CPU {
    interrupt;
    mapper;
    halt;
    ticks;
    IMEPendling;
    REG;
    SP;
    PC;
    hexValue(value) {
        let digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F"];
        return digits[value >> 4 & 0x0F] + digits[value & 0xF];
    }
    dumpState() {
        let state = "";
        state = state + "A:" + this.hexValue(this.REG[_A]);
        state = state + " F:" + this.hexValue(this.REG[_F]);
        state = state + " B:" + this.hexValue(this.REG[_B]);
        state = state + " C:" + this.hexValue(this.REG[_C]);
        state = state + " D:" + this.hexValue(this.REG[_D]);
        state = state + " E:" + this.hexValue(this.REG[_E]);
        state = state + " H:" + this.hexValue(this.REG[_H]);
        state = state + " L:" + this.hexValue(this.REG[_L]);
        state = state + " SP:" + this.hexValue(this.SP >> 8) + this.hexValue(this.SP & 0xFF);
        state = state + " PC:" + this.hexValue(this.PC >> 8) + this.hexValue(this.PC & 0xFF);
        state = state + " PCMEM:" + this.hexValue(this.mapper.read(this.PC));
        state = state + "," + this.hexValue(this.mapper.read(this.PC + 1));
        state = state + "," + this.hexValue(this.mapper.read(this.PC + 2));
        state = state + "," + this.hexValue(this.mapper.read(this.PC + 3));
        return state;
    }
    reset() {
        this.REG[_A] = 0x01;
        this.REG[_F] = FLAG_Z | FLAG_H | FLAG_C;
        this.REG[_B] = 0x00;
        this.REG[_C] = 0x13;
        this.REG[_D] = 0x00;
        this.REG[_E] = 0xD8;
        this.REG[_H] = 0x01;
        this.REG[_L] = 0x4D;
        this.SP = 0xFFFE;
        this.PC = 0x0100;
        this.halt = 0;
        this.ticks = 0;
        this.IMEPendling = 0;
    }
    constructor(interrupt, mapper) {
        this.interrupt = interrupt;
        this.mapper = mapper;
        this.REG = [];
        for (let i = 0; i < 8; i = i + 1) {
            this.REG.push(0);
        }
        this.reset();
    }
    executePrefixCB() {
        let op = this.mapper.read(this.PC);
        this.PC = (this.PC + 1) & 0xFFFF;
        let cycles = 8;
        let dst = op & 0x07;
        let val = this.REG[dst];
        if (dst == _HL) {
            val = this.mapper.read(this.REG[_H] << 8 | (this.REG[_L]));
            cycles = cycles + 4;
        }
        if (op <= 0x3F) {
            let alOp = (op >> 3) & 0x07;
            if (alOp == 0) { // RLC
                let carry = val >> 7;
                val = ((val << 1) | carry) & 0xFF;
                this.REG[_F] = (val == 0 ? FLAG_Z : 0) | (carry ? FLAG_C : 0);
            }
            if (alOp == 1) { // RRC
                let carry = val & 0x01;
                val = (val >> 1) | (carry ? 0x80 : 0);
                this.REG[_F] = (val == 0 ? FLAG_Z : 0) | (carry ? FLAG_C : 0);
            }
            if (alOp == 2) { // RL
                let carry = val >> 7;
                val = ((val << 1) | (this.REG[_F] & FLAG_C ? 1 : 0)) & 0xFF;
                this.REG[_F] = (val == 0 ? FLAG_Z : 0) | (carry ? FLAG_C : 0);
            }
            if (alOp == 3) { // RR
                let carry = val & 0x01;
                val = (val >> 1) | (this.REG[_F] & FLAG_C ? 0x80 : 0);
                this.REG[_F] = (val == 0 ? FLAG_Z : 0) | (carry ? FLAG_C : 0);
            }
            if (alOp == 4) { // SLA
                let carry = val >> 7;
                val = (val << 1) & 0xFF;
                this.REG[_F] = (val == 0 ? FLAG_Z : 0) | (carry ? FLAG_C : 0);
            }
            if (alOp == 5) { // SRA
                let carry = val & 1;
                val = ((val >> 1) | (val & 0x80));
                this.REG[_F] = (val == 0 ? FLAG_Z : 0) | (carry ? FLAG_C : 0);
            }
            if (alOp == 6) { // SWAP
                val = ((val & 0x0F) << 4) | (val >> 4);
                this.REG[_F] = (val == 0 ? FLAG_Z : 0);
            }
            if (alOp == 7) { // SRL
                let carry = val & 0x01;
                val = ((val >> 1) & 0xFF);
                this.REG[_F] = (val == 0 ? FLAG_Z : 0) | (carry ? FLAG_C : 0);
            }
        }
        if (op >= 0x40 && op < 0x80) { // BIT
            let bit = (op >> 3) & 0x07;
            this.REG[_F] = (val & (1 << bit) ? 0 : FLAG_Z) | FLAG_H | (this.REG[_F] & FLAG_C);
            return cycles;
        }
        if (op >= 0x80) { // SET/RES
            let bit = (op >> 3) & 0x07;
            if (op & 0x40) {
                val = val | (1 << bit);
            }
            else {
                val = val & ((1 << bit) ^ 0xFF);
            }
        }
        if (dst == _HL) {
            this.mapper.write(this.REG[_H] << 8 | (this.REG[_L]), val);
            cycles = cycles + 4;
        }
        else {
            this.REG[dst] = val;
        }
        return cycles;
    }
    executeOp() {
        let op = this.mapper.read(this.PC);
        this.PC = (this.PC + 1) & 0xFFFF;
        if (op <= 0x3F) {
            if ((op & 0x0F) == 0x00) {
                if (op == 0x00) { // NOP
                    return 4;
                }
                if (op == 0x20 || op == 0x30) { // JP NZ/NC,r8
                    let flag = (op & 0x10) ? FLAG_C : FLAG_Z;
                    let val = this.mapper.read(this.PC);
                    val = val > 127 ? 0xFFFF - (255 - val) : val;
                    this.PC = (this.PC + 1) & 0xFFFF;
                    if (!(this.REG[_F] & flag)) {
                        this.PC = (this.PC + val) & 0xFFFF;
                        return 12;
                    }
                    return 8;
                }
            }
            if ((op & 0x0F) == 0x01) { // LD xx, d16
                let dst = (op & 0x70) >> 3;
                let dl = this.mapper.read(this.PC);
                let dh = this.mapper.read(this.PC + 1);
                this.PC = (this.PC + 2) & 0xFFFF;
                if (op == 0x31) {
                    this.SP = (dh << 8) + dl;
                    return 12;
                }
                this.REG[dst] = dh;
                this.REG[dst + 1] = dl;
                return 12;
            }
            if ((op & 0x0F) == 0x02) { // LD xx, A
                let dst = (op & 0x70) >> 3;
                if (op == 0x22 || op == 0x32) { // LD (HL+/-),A
                    this.mapper.write(this.REG[_H] << 8 | this.REG[_L], this.REG[_A]);
                    let inc = (op & 0x10) >> 4 ? 0xFFFF : 0x0001;
                    let res = ((this.REG[_H] << 8 | this.REG[_L]) + inc) & 0xFFFF;
                    this.REG[_H] = res >> 8;
                    this.REG[_L] = res & 0xFF;
                    return 8;
                }
                this.mapper.write(this.REG[dst] << 8 | this.REG[dst + 1], this.REG[_A]);
                return 8;
            }
            if ((op & 0x07) == 0x03) { // INC/DEC xx
                let inc = op & 0x08 ? 0xFFFF : 0x0001;
                if ((op & 0x30) == 0x30) {
                    this.SP = (this.SP + inc) & 0xFFFF;
                    return 8;
                }
                let dst = (op & 0x70) >> 3;
                let data = (this.REG[dst] << 8 | this.REG[dst + 1]);
                data = (data + inc) & 0xFFFF;
                this.REG[dst] = data >> 8;
                this.REG[dst + 1] = data & 0xFF;
                return 8;
            }
            if ((op & 0x06) == 0x04) { // INC/DEC x
                let isDec = op & 0x01;
                let dst = (op & 0x38) >> 3;
                let inc = isDec ? 0xFF : 0x01;
                let val = this.REG[dst];
                if (dst == _HL) {
                    val = this.mapper.read(this.REG[_H] << 8 | (this.REG[_L]));
                }
                let valPost = val + inc & 0xFF;
                let half = (val >> 4) ^ (valPost >> 4) ? 1 : 0;
                this.REG[_F] = (valPost == 0 ? FLAG_Z : 0) | (isDec ? FLAG_N : 0) | (half ? FLAG_H : 0) | (this.REG[_F] & FLAG_C);
                if (dst == _HL) {
                    this.mapper.write(this.REG[_H] << 8 | (this.REG[_L]), valPost);
                    return 12;
                }
                else {
                    this.REG[dst] = valPost;
                    return 4;
                }
            }
            if ((op & 0x07) == 0x06) { // LD x, d8
                let dst = (op & 0x38) >> 3;
                let val = this.mapper.read(this.PC);
                this.PC = (this.PC + 1) & 0xFFFF;
                if (dst == _HL) {
                    this.mapper.write(this.REG[_H] << 8 | (this.REG[_L]), val);
                    return 12;
                }
                else {
                    this.REG[dst] = val;
                    return 8;
                }
            }
            if ((op & 0x0F) == 0x07) {
                if (op == 0x07) { // RLCA
                    let carry = this.REG[_A] >> 7;
                    this.REG[_A] = ((this.REG[_A] << 1) | carry) & 0xFF;
                    this.REG[_F] = (carry ? FLAG_C : 0);
                    return 4;
                }
                if (op == 0x17) { // RLA
                    let carry = this.REG[_A] >> 7;
                    this.REG[_A] = ((this.REG[_A] << 1) | (this.REG[_F] & FLAG_C ? 0x01 : 0)) & 0xFF;
                    this.REG[_F] = (carry ? FLAG_C : 0);
                    return 4;
                }
                if (op == 0x27) { // DAA
                    let val = this.REG[_A];
                    if (this.REG[_F] & FLAG_N) {
                        if (this.REG[_F] & FLAG_H) {
                            val = val - 6;
                        }
                        if (this.REG[_F] & FLAG_C) {
                            val = val - 96;
                        }
                    }
                    else {
                        if ((this.REG[_F] & FLAG_C) || (val > 0x99)) {
                            val = val + 96;
                            this.REG[_F] = this.REG[_F] | FLAG_C;
                        }
                        if ((this.REG[_F] & FLAG_H) || ((val & 0xF) > 0x9)) {
                            val = val + 6;
                            this.REG[_F] = this.REG[_F] & (0xF0 ^ FLAG_H);
                        }
                    }
                    this.REG[_A] = val & 0xFF;
                    this.REG[_F] = (this.REG[_A] == 0 ? FLAG_Z : 0) | (this.REG[_F] & FLAG_N) | (this.REG[_F] & FLAG_C);
                    return 4;
                }
                if (op == 0x37) { // SCF
                    this.REG[_F] = (this.REG[_F] & FLAG_Z) | FLAG_C;
                    return 4;
                }
            }
            if ((op & 0x0F) == 0x08) {
                if (op == 0x08) { // LD (a16), SP
                    let addr = this.mapper.read(this.PC + 1) << 8 | this.mapper.read(this.PC);
                    this.PC = (this.PC + 2) & 0xFFFF;
                    this.mapper.write(addr, this.SP & 0xFF);
                    this.mapper.write(addr + 1, this.SP >> 8);
                    return 20;
                }
                let val = this.mapper.read(this.PC);
                this.PC = (this.PC + 1) & 0xFFFF;
                val = val > 127 ? 0xFFFF - (255 - val) : val;
                if (op == 0x18) { // JR r8
                    this.PC = (this.PC + val) & 0xFFFF;
                    return 12;
                }
                if (op == 0x28 || op == 0x38) { // JP Z/C,r8
                    let flag = (op & 0x10) ? FLAG_C : FLAG_Z;
                    if (this.REG[_F] & flag) {
                        this.PC = (this.PC + val) & 0xFFFF;
                        return 12;
                    }
                    return 8;
                }
            }
            if ((op & 0x0F) == 0x09) { // ADD HL, xx
                let src = (op & 0x70) >> 3;
                let hl = this.REG[_H] << 8 | this.REG[_L];
                let val = op == 0x39 ? this.SP : this.REG[src] << 8 | this.REG[src + 1];
                let carry = (hl + val) >> 16;
                let half = ((hl & 0xFFF) + (val & 0xFFF)) >> 12;
                val = (val + hl) & 0xFFFF;
                this.REG[_H] = val >> 8;
                this.REG[_L] = val & 0xFF;
                this.REG[_F] = (this.REG[_F] & FLAG_Z) | (half ? FLAG_H : 0) | (carry ? FLAG_C : 0);
                return 8;
            }
            if ((op & 0x0F) == 0x0A) { // LD A, (xx)
                let src = (op & 0x70) >> 3;
                if (op == 0x2A || op == 0x3A) { // LD (HL+/-),A
                    this.REG[_A] = this.mapper.read(this.REG[_H] << 8 | this.REG[_L]);
                    let inc = (op & 0x10) >> 4 ? 0xFFFF : 0x0001;
                    let res = ((this.REG[_H] << 8 | this.REG[_L]) + inc) & 0xFFFF;
                    this.REG[_H] = res >> 8;
                    this.REG[_L] = res & 0xFF;
                    return 8;
                }
                this.REG[_A] = this.mapper.read(this.REG[src] << 8 | this.REG[src + 1]);
                return 8;
            }
            if ((op & 0x0F) == 0x0F) {
                if (op == 0x0F) { // RRCA
                    let carry = this.REG[_A] & 0x01;
                    this.REG[_A] = (this.REG[_A] >> 1) | (carry ? 0x80 : 0);
                    this.REG[_F] = (carry ? FLAG_C : 0);
                    return 4;
                }
                if (op == 0x1F) { // RRA
                    let carry = this.REG[_A] & 0x01;
                    this.REG[_A] = (this.REG[_A] >> 1) | (this.REG[_F] & FLAG_C ? 0x80 : 0);
                    this.REG[_F] = (carry ? FLAG_C : 0);
                    return 4;
                }
                if (op == 0x2F) { // CPL
                    this.REG[_A] = this.REG[_A] ^ 0xFF;
                    this.REG[_F] = (this.REG[_F] & FLAG_Z) | FLAG_N | FLAG_H | (this.REG[_F] & FLAG_C);
                    return 4;
                }
                if (op == 0x3F) { // CCF
                    this.REG[_F] = (this.REG[_F] & FLAG_Z) | (this.REG[_F] & FLAG_C ? 0 : FLAG_C);
                    return 4;
                }
            }
        }
        if (op >= 0x40 && op <= 0x7F) { // LD x,x
            let src = op & 0x07;
            let dst = (op >> 3) & 0x07;
            if (op == 0x76) { // HALT
                this.halt = 1;
                return 4;
            }
            if (src == _HL) {
                this.REG[dst] = this.mapper.read(this.REG[_H] << 8 | (this.REG[_L]));
                return 8;
            }
            if (dst == _HL) {
                this.mapper.write(this.REG[_H] << 8 | (this.REG[_L]), this.REG[src]);
                return 8;
            }
            this.REG[dst] = this.REG[src];
            return 4;
        }
        if ((op >= 0x80 && op <= 0xBF) || (op >= 0xC0 && (op & 0x07) == 0x06)) {
            let src = op & 0x07;
            let alOp = (op >> 3) & 0x07;
            let cycles = 4;
            let val = this.REG[src];
            if (op >= 0xC0) {
                val = this.mapper.read(this.PC);
                this.PC = (this.PC + 1) & 0xFFFF;
                cycles = 8;
            }
            if (op < 0xC0 && src == _HL) {
                val = this.mapper.read(this.REG[_H] << 8 | (this.REG[_L]));
                cycles = 8;
            }
            if (alOp == 0) { // ADD A,X
                let valPost = this.REG[_A] + val;
                let half = ((this.REG[_A] & 0x0F) + (val & 0x0F)) >> 4;
                let carry = valPost > 0xFF ? 1 : 0;
                this.REG[_A] = valPost & 0xFF;
                this.REG[_F] = (this.REG[_A] == 0 ? FLAG_Z : 0) | (half ? FLAG_H : 0) | (carry ? FLAG_C : 0);
            }
            if (alOp == 1) { // ADC A,X
                let valPost = this.REG[_A] + val + (this.REG[_F] & FLAG_C ? 1 : 0);
                let half = ((this.REG[_A] & 0x0F) + (val & 0x0F) + (this.REG[_F] & FLAG_C ? 1 : 0)) >> 4;
                let carry = valPost > 0xFF ? 1 : 0;
                this.REG[_A] = valPost & 0xFF;
                this.REG[_F] = (this.REG[_A] == 0 ? FLAG_Z : 0) | (half ? FLAG_H : 0) | (carry ? FLAG_C : 0);
            }
            if (alOp == 2) { // SUB A,X
                let valPost = this.REG[_A] + ((val ^ 0xFF) + 1);
                let half = ((this.REG[_A] & 0x0F) - (val & 0x0F)) < 0 ? 1 : 0;
                let carry = this.REG[_A] - val < 0 ? 1 : 0;
                this.REG[_A] = valPost & 0xFF;
                this.REG[_F] = (this.REG[_A] == 0 ? FLAG_Z : 0) | FLAG_N | (half ? FLAG_H : 0) | (carry ? FLAG_C : 0);
            }
            if (alOp == 3) { // SBC A,X
                let valPost = this.REG[_A] + ((val ^ 0xFF) + 1) + (this.REG[_F] & FLAG_C ? 0xFF : 0x00);
                let half = ((this.REG[_A] & 0x0F) - (val & 0x0F) - (this.REG[_F] & FLAG_C ? 1 : 0)) < 0 ? 1 : 0;
                let carry = this.REG[_A] - val - (this.REG[_F] & FLAG_C ? 1 : 0) < 0 ? 1 : 0;
                this.REG[_A] = valPost & 0xFF;
                this.REG[_F] = (this.REG[_A] == 0 ? FLAG_Z : 0) | FLAG_N | (half ? FLAG_H : 0) | (carry ? FLAG_C : 0);
            }
            if (alOp == 4) { // AND A,X
                this.REG[_A] = this.REG[_A] & val;
                this.REG[_F] = (this.REG[_A] == 0 ? FLAG_Z : 0) | FLAG_H;
            }
            if (alOp == 5) { // XOR A,X
                this.REG[_A] = this.REG[_A] ^ val;
                this.REG[_F] = this.REG[_A] == 0 ? FLAG_Z : 0;
            }
            if (alOp == 6) { // OR A,X
                this.REG[_A] = this.REG[_A] | val;
                this.REG[_F] = this.REG[_A] == 0 ? FLAG_Z : 0;
            }
            if (alOp == 7) { // CP d8
                let valPost = this.REG[_A] + ((val ^ 0xFF) + 1);
                let half = ((this.REG[_A] & 0x0F) - (val & 0x0F)) < 0 ? 1 : 0;
                let carry = this.REG[_A] - val < 0 ? 1 : 0;
                this.REG[_F] = ((valPost & 0xFF) == 0 ? FLAG_Z : 0) | FLAG_N | (half ? FLAG_H : 0) | (carry ? FLAG_C : 0);
            }
            return cycles;
        }
        if (op >= 0xC0) {
            if ((op & 0x0F) == 0x00) {
                if (op == 0xC0 || op == 0xD0) { // RET NZ/NC
                    let flag = (op & 0x10) ? FLAG_C : FLAG_Z;
                    if (!(this.REG[_F] & flag)) {
                        this.PC = this.mapper.read(this.SP + 1) << 8 | this.mapper.read(this.SP);
                        this.SP = (this.SP + 2) & 0xFFFF;
                        return 20;
                    }
                    return 8;
                }
                if (op == 0xE0) {
                    let addr = 0xFF00 | this.mapper.read(this.PC);
                    this.PC = (this.PC + 1) & 0xFFFF;
                    this.mapper.write(addr, this.REG[_A]);
                    return 12;
                }
                if (op == 0xF0) {
                    let addr = 0xFF00 | this.mapper.read(this.PC);
                    this.PC = (this.PC + 1) & 0xFFFF;
                    this.REG[_A] = this.mapper.read(addr);
                    return 12;
                }
            }
            if ((op & 0x0B) == 0x01) { // PUSH/POP xx
                let srcH = (op & 0x38) >> 3;
                let srcL = srcH + 1;
                if (op >> 4 == 0x0F) {
                    srcH = srcH + 1;
                    srcL = srcL - 1;
                }
                if (op & 0x04) {
                    this.SP = (this.SP + 0xFFFE) & 0xFFFF;
                    this.mapper.write(this.SP, this.REG[srcL]);
                    this.mapper.write(this.SP + 1, this.REG[srcH]);
                    return 16;
                }
                else {
                    this.REG[srcL] = this.mapper.read(this.SP);
                    this.REG[srcH] = this.mapper.read(this.SP + 1);
                    this.SP = (this.SP + 2) & 0xFFFF;
                    this.REG[_F] = this.REG[_F] & 0xF0;
                    return 12;
                }
            }
            if ((op & 0x0F) == 0x02) {
                if (op == 0xC2 || op == 0xD2) { // JP NZ,a16
                    let flag = (op & 0x10) ? FLAG_C : FLAG_Z;
                    let addr = this.mapper.read(this.PC + 1) << 8 | this.mapper.read(this.PC);
                    this.PC = (this.PC + 2) & 0xFFFF;
                    if (!(this.REG[_F] & flag)) {
                        this.PC = addr;
                        return 16;
                    }
                    return 12;
                }
                if (op == 0xE2) { // LD (C),A
                    this.mapper.write(0xFF00 | this.REG[_C], this.REG[_A]);
                    return 8;
                }
                if (op == 0xF2) { // LD A,(C)
                    this.REG[_A] = this.mapper.read(0xFF00 | this.REG[_C]);
                    return 8;
                }
            }
            if ((op & 0x0F) == 0x03) {
                if (op == 0xC3) { // JP a16
                    this.PC = this.mapper.read(this.PC + 1) << 8 | this.mapper.read(this.PC);
                    return 16;
                }
                if (op == 0xF3) { // DI
                    this.interrupt.IME = 0;
                    return 4;
                }
            }
            if ((op & 0x07) == 0x04) { // CALL N/Z/C, a16
                let addr = this.mapper.read(this.PC + 1) << 8 | this.mapper.read(this.PC);
                this.PC = (this.PC + 2) & 0xFFFF;
                let flag = (op & 0x10) ? FLAG_C : FLAG_Z;
                let tst = (this.REG[_F] & flag);
                if (!(op & 0x08)) {
                    tst = tst ? 0 : 1;
                }
                if (tst) {
                    this.SP = (this.SP + 0xFFFE) & 0xFFFF;
                    this.mapper.write(this.SP, this.PC & 0xFF);
                    this.mapper.write(this.SP + 1, (this.PC >> 8) & 0xFF);
                    this.PC = addr;
                    return 24;
                }
                return 12;
            }
            if ((op & 0x07) == 0x07) { // RST
                let addr = op & 0x38;
                this.SP = (this.SP + 0xFFFE) & 0xFFFF;
                this.mapper.write(this.SP, this.PC & 0xFF);
                this.mapper.write(this.SP + 1, (this.PC >> 8) & 0xFF);
                this.PC = addr;
                return 16;
            }
            if ((op & 0x0F) == 0x08) {
                if (op == 0xC8 || op == 0xD8) { // RET Z/C
                    let flag = (op & 0x10) ? FLAG_C : FLAG_Z;
                    if (this.REG[_F] & flag) {
                        this.PC = this.mapper.read(this.SP + 1) << 8 | this.mapper.read(this.SP);
                        this.SP = (this.SP + 2) & 0xFFFF;
                        return 20;
                    }
                    return 8;
                }
                if (op == 0xE8) { // ADD SP, r8
                    let val = this.mapper.read(this.PC);
                    val = val > 127 ? 0xFFFF - (255 - val) : val;
                    this.PC = (this.PC + 1) & 0xFFFF;
                    let carry = ((this.SP & 0xFF) + (val & 0xFF)) >> 8;
                    let half = ((this.SP & 0x0F) + (val & 0x0F)) >> 4;
                    this.SP = (this.SP + val) & 0xFFFF;
                    this.REG[_F] = (half ? FLAG_H : 0) | (carry ? FLAG_C : 0);
                    return 16;
                }
                if (op == 0xF8) { // LD HL, SP+r8
                    let val = this.mapper.read(this.PC);
                    val = val > 127 ? 0xFFFF - (255 - val) : val;
                    this.PC = (this.PC + 1) & 0xFFFF;
                    let carry = ((this.SP & 0xFF) + (val & 0xFF)) >> 8;
                    let half = ((this.SP & 0x0F) + (val & 0x0F)) >> 4;
                    let addr = (this.SP + val) & 0xFFFF;
                    this.REG[_L] = addr & 0xFF;
                    this.REG[_H] = addr >> 8;
                    this.REG[_F] = (half ? FLAG_H : 0) | (carry ? FLAG_C : 0);
                    return 12;
                }
            }
            if ((op & 0x0F) == 0x09) {
                if (op == 0xC9 || op == 0xD9) { // RET / RETI
                    this.PC = this.mapper.read(this.SP + 1) << 8 | this.mapper.read(this.SP);
                    this.SP = (this.SP + 2) & 0xFFFF;
                    if (op == 0xD9) {
                        this.interrupt.IME = 1;
                    }
                    return 16;
                }
                if (op == 0xE9) { // JP (HL)
                    this.PC = this.REG[_H] << 8 | this.REG[_L];
                    return 4;
                }
                if (op == 0xF9) { // LD SP, HL
                    this.SP = this.REG[_H] << 8 | this.REG[_L];
                    return 8;
                }
            }
            if ((op & 0x0F) == 0x0A) {
                if (op == 0xCA || op == 0xDA) { // JP Z,a16
                    let flag = (op & 0x10) ? FLAG_C : FLAG_Z;
                    let addr = this.mapper.read(this.PC + 1) << 8 | this.mapper.read(this.PC);
                    this.PC = (this.PC + 2) & 0xFFFF;
                    if (this.REG[_F] & flag) {
                        this.PC = addr;
                        return 16;
                    }
                    return 12;
                }
                if (op == 0xEA) { // LD (a16),A
                    this.mapper.write(this.mapper.read(this.PC + 1) << 8 | this.mapper.read(this.PC), this.REG[_A]);
                    this.PC = (this.PC + 2) & 0xFFFF;
                    return 16;
                }
                if (op == 0xFA) { // LD A,(a16)
                    this.REG[_A] = this.mapper.read(this.mapper.read(this.PC + 1) << 8 | this.mapper.read(this.PC));
                    this.PC = (this.PC + 2) & 0xFFFF;
                    return 16;
                }
            }
            if ((op & 0x0F) == 0x0B) {
                if (op == 0xCB) { // PREFIX CB
                    return this.executePrefixCB();
                }
                if (op == 0xFB) { // EI
                    this.IMEPendling = 1;
                    return 4;
                }
            }
            if ((op & 0x0F) == 0x0D) {
                if (op == 0xCD) { // CALL a16
                    this.SP = (this.SP + 0xFFFE) & 0xFFFF;
                    this.mapper.write(this.SP, (this.PC + 2) & 0xFF);
                    this.mapper.write(this.SP + 1, ((this.PC + 2) >> 8) & 0xFF);
                    this.PC = this.mapper.read(this.PC + 1) << 8 | this.mapper.read(this.PC);
                    return 24;
                }
            }
        }
        return 0;
    }
    nextCycle() {
        if (this.IMEPendling) {
            this.interrupt.IME = 1;
            this.IMEPendling = 0;
        }
        if (this.interrupt.IE & this.interrupt.IF) {
            this.halt = 0;
        }
        if (this.interrupt.IME) {
            for (let i = 0; i < 5; i = i + 1) {
                if (this.interrupt.IE & (this.interrupt.IF & (1 << i))) {
                    this.interrupt.IME = 0;
                    this.interrupt.IF = this.interrupt.IF & (0x1F ^ (1 << i));
                    this.SP = (this.SP + 0xFFFE) & 0xFFFF;
                    this.mapper.write(this.SP, this.PC & 0xFF);
                    this.mapper.write(this.SP + 1, (this.PC >> 8) & 0xFF);
                    this.PC = 0x40 + (i << 3);
                    return 20;
                }
            }
        }
        if (this.halt) {
            return 4;
        }
        return this.executeOp();
    }
    tick() {
        if (this.ticks == 0) {
            this.ticks = this.nextCycle();
        }
        this.ticks = this.ticks - 1;
    }
}

class GameBoy {
    interrupt;
    timer;
    rom;
    ram;
    ppu;
    apu;
    gamepad;
    mapper;
    cpu;
    audioSampleRate;
    audioSamplePos;
    reset() {
        this.timer.reset();
        this.ppu.reset();
        this.apu.reset();
        this.interrupt.reset();
        this.mapper.reset();
        this.cpu.reset();
    }
    constructor() {
        this.interrupt = new Interrupt();
        this.timer = new Timer(this.interrupt);
        this.rom = new ROM();
        this.ram = new RAM();
        this.ppu = new PPU(this.interrupt);
        this.apu = new APU();
        this.gamepad = new GamePad();
        this.mapper = new Mapper(this.timer, this.rom, this.ram, this.ppu, this.apu, this.gamepad, this.interrupt);
        this.cpu = new CPU(this.interrupt, this.mapper);
        this.reset();
        this.audioSampleRate = 44100;
        this.audioSamplePos = 0;
    }
    tick() {
        this.cpu.tick();
        this.timer.tick();
        this.ppu.tick();
        this.apu.tick();
        this.mapper.tick();
    }
    loadRom(romData) {
        this.rom.data = romData;
        this.reset();
    }
    setVBuffer(vBuffer) {
        this.ppu.vBuffer = vBuffer;
        this.ppu.frame = 0;
    }
    advanceAudioSample(aBuffer) {
        let volL = (this.apu.NR50 >> 4) & 7;
        if (volL == 0) {
            volL = 1;
        }
        let volR = this.apu.NR50 & 7;
        if (volR == 0) {
            volR = 1;
        }
        aBuffer[0] = (this.apu.PCML * volL) * 0.001;
        aBuffer[1] = (this.apu.PCMR * volR) * 0.001;
        while (this.audioSamplePos < 4194304) {
            this.audioSamplePos = this.audioSamplePos + this.audioSampleRate;
            this.tick();
        }
        this.audioSamplePos = this.audioSamplePos - 4194304;
        return this.ppu.frame;
    }
    advanceFrame(vBuffer) {
        this.ppu.vBuffer = vBuffer;
        // this.mockPPUscroll()
        while (this.ppu.frame == 0) {
            this.tick();
        }
        this.ppu.frame = 0;
    }
    buttonEvent(buttonIndex, buttonDown) {
        this.gamepad.buttonEvent(buttonIndex, buttonDown);
    }
}
new GameBoy();
