import AppKit
import WebKit
import ImageIO

let appName = "Weld Lab Laser Safety"

func makeIcons(at folder: String) throws {
    let directory = URL(fileURLWithPath: folder, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    for (name, size) in [("icon_16x16",16),("icon_16x16@2x",32),("icon_32x32",32),("icon_32x32@2x",64),("icon_128x128",128),("icon_128x128@2x",256),("icon_256x256",256),("icon_256x256@2x",512),("icon_512x512",512),("icon_512x512@2x",1024)] {
        let space = CGColorSpaceCreateDeviceRGB()
        let context = CGContext(data:nil,width:size,height:size,bitsPerComponent:8,bytesPerRow:0,space:space,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.scaleBy(x:CGFloat(size)/1024,y:CGFloat(size)/1024)
        let tile = CGPath(roundedRect:CGRect(x:34,y:34,width:956,height:956),cornerWidth:214,cornerHeight:214,transform:nil)
        context.addPath(tile); context.clip()
        let colors = [CGColor(red:0.14,green:0.18,blue:0.28,alpha:1),CGColor(red:0.42,green:0.40,blue:0.59,alpha:1),CGColor(red:0.50,green:0.70,blue:0.66,alpha:1)] as CFArray
        let gradient = CGGradient(colorsSpace:space,colors:colors,locations:[0,0.6,1])!
        context.drawLinearGradient(gradient,start:CGPoint(x:120,y:950),end:CGPoint(x:950,y:60),options:[])
        context.setStrokeColor(CGColor(gray:1,alpha:0.20));context.setLineWidth(6)
        context.addPath(CGPath(roundedRect:CGRect(x:52,y:52,width:920,height:920),cornerWidth:194,cornerHeight:194,transform:nil));context.strokePath()
        context.setLineCap(.round);context.setLineWidth(35)
        context.setShadow(offset:.zero,blur:30,color:CGColor(red:0.75,green:0.93,blue:0.88,alpha:0.7))
        context.setStrokeColor(CGColor(gray:1,alpha:0.92))
        for angle in [0.0,Double.pi/4,Double.pi/2,Double.pi*3/4] {
            let dx = CGFloat(cos(angle))*235, dy = CGFloat(sin(angle))*235
            context.move(to:CGPoint(x:512-dx,y:512-dy));context.addLine(to:CGPoint(x:512+dx,y:512+dy));context.strokePath()
        }
        context.setShadow(offset:.zero,blur:0,color:nil)
        context.setFillColor(CGColor(gray:1,alpha:1));context.fillEllipse(in:CGRect(x:458,y:458,width:108,height:108))
        let image = context.makeImage()!
        let destination = CGImageDestinationCreateWithURL(directory.appendingPathComponent(name+".png") as CFURL,"public.png" as CFString,1,nil)!
        CGImageDestinationAddImage(destination,image,nil);CGImageDestinationFinalize(destination)
    }
}

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    var windows: [ClientWindow] = []
    var activity: NSObjectProtocol?
    var connectionURL: URL? { UserDefaults.standard.string(forKey:"PiServerURL").flatMap(URL.init(string:)) }
    func applicationDidFinishLaunching(_ notification: Notification) {
        makeMenu();newWindow()
        activity=ProcessInfo.processInfo.beginActivity(options:[.idleDisplaySleepDisabled],reason:"Show shared laboratory laser status")
        NSApp.activate(ignoringOtherApps:true)
    }
    func applicationWillTerminate(_ notification: Notification) { if let activity { ProcessInfo.processInfo.endActivity(activity) } }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool { true }
    func applicationShouldHandleReopen(_ sender:NSApplication,hasVisibleWindows flag:Bool)->Bool { if !flag { newWindow() };return true }
    var focused: ClientWindow? { windows.first(where:{$0.window === NSApp.keyWindow}) ?? windows.first }
    func makeMenu() {
        let menu=NSMenu(),appItem=NSMenuItem();menu.addItem(appItem)
        let appMenu=NSMenu(title:appName);appItem.submenu=appMenu
        appMenu.addItem(withTitle:"About \(appName)",action:#selector(NSApplication.orderFrontStandardAboutPanel(_:)),keyEquivalent:"")
        for (title,action,key) in [("Settings…",#selector(showSettings),","),("Connect to Display Computer…",#selector(promptConnection),""),("Disconnect from Display Computer",#selector(disconnectDisplay),"")] {
            let item=appMenu.addItem(withTitle:title,action:action,keyEquivalent:key);item.target=self
        }
        appMenu.addItem(.separator());appMenu.addItem(withTitle:"Quit \(appName)",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
        let editItem=NSMenuItem();menu.addItem(editItem);let edit=NSMenu(title:"Edit");editItem.submenu=edit
        for (title,action,key) in [("Undo","undo:","z"),("Cut","cut:","x"),("Copy","copy:","c"),("Paste","paste:","v"),("Select All","selectAll:","a")] { edit.addItem(withTitle:title,action:NSSelectorFromString(action),keyEquivalent:key) }
        let viewItem=NSMenuItem();menu.addItem(viewItem);let view=NSMenu(title:"View");viewItem.submenu=view
        let monitor=view.addItem(withTitle:"New Monitor Window",action:#selector(newMonitor),keyEquivalent:"n");monitor.target=self;monitor.keyEquivalentModifierMask=[.command,.shift]
        let full=view.addItem(withTitle:"Toggle Full Screen",action:#selector(fullScreen),keyEquivalent:"f");full.target=self;full.keyEquivalentModifierMask=[.control,.command]
        NSApp.mainMenu=menu
    }
    func newWindow(monitor:Bool=false) { let controller=ClientWindow(appOwner:self,monitor:monitor);windows.append(controller);controller.showWindow(nil);controller.window?.makeKeyAndOrderFront(nil);controller.loadPreview() }
    @objc func newMonitor() { newWindow(monitor:true) }
    @objc func fullScreen() { focused?.window?.toggleFullScreen(nil) }
    @objc func showSettings() {
        guard let controller=focused else { return }
        if controller.window?.contentView === controller.webView { controller.webView.evaluateJavaScript("document.getElementById('settings-dialog')?.showModal()",completionHandler:nil) }
        else { controller.window?.makeFirstResponder(controller.addressField) }
    }
    @objc func promptConnection() {
        let alert=NSAlert();alert.messageText="Connect to your display computer";alert.informativeText="Use the display computer address on your lab network."
        let field=NSTextField(frame:NSRect(x:0,y:0,width:320,height:26));field.placeholderString="DISPLAY-PC:8765";field.stringValue=connectionURL?.absoluteString ?? "";alert.accessoryView=field
        alert.addButton(withTitle:"Connect");alert.addButton(withTitle:"Cancel")
        if alert.runModal() == .alertFirstButtonReturn { connect(field.stringValue) }
    }
    func connect(_ address:String) {
        var value=address.trimmingCharacters(in:.whitespacesAndNewlines);if !value.contains("://") { value="http://"+value }
        guard var parts=URLComponents(string:value),["http","https"].contains(parts.scheme?.lowercased() ?? ""),let host=parts.host,!host.isEmpty,parts.user==nil,parts.password==nil,parts.query==nil,parts.fragment==nil,["","/"].contains(parts.path) else {
            focused?.showHome("Enter the display computer address, for example DISPLAY-PC:8765.");return
        }
        if parts.port==nil { parts.port=8765 };parts.path="/"
        guard let url=parts.url else { return }
        UserDefaults.standard.set(url.absoluteString,forKey:"PiServerURL")
        for controller in windows { controller.loadTarget() }
    }
    @objc func disconnectDisplay() { UserDefaults.standard.removeObject(forKey:"PiServerURL");for controller in windows { controller.showHome() } }
}

@MainActor final class ClientWindow: NSWindowController,NSWindowDelegate,WKNavigationDelegate,WKUIDelegate,WKScriptMessageHandler {
    weak var appOwner:AppDelegate?
    let webView:WKWebView
    let home=NSView()
    let addressField=NSTextField()
    let message=NSTextField(wrappingLabelWithString:"")
    let monitor:Bool
    init(appOwner:AppDelegate,monitor:Bool) {
        self.appOwner=appOwner;self.monitor=monitor
        let configuration=WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController.addUserScript(WKUserScript(source:"window.weldNative=Object.freeze({});window.weldPreview=location.protocol==='file:';",injectionTime:.atDocumentStart,forMainFrameOnly:true))
        webView=WKWebView(frame:.zero,configuration:configuration)
        let window=NSWindow(contentRect:NSRect(x:0,y:0,width:1100,height:780),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        window.title=monitor ? appName+" — Monitor" : appName;window.minSize=NSSize(width:580,height:500);window.center();window.setFrameAutosaveName(monitor ? "WeldMonitorWindow" : "WeldMainWindow")
        super.init(window:window)
        window.delegate=self;webView.navigationDelegate=self;webView.uiDelegate=self
        configuration.userContentController.add(self,name:"weldApp")
        let title=NSTextField(labelWithString:appName);title.font = .systemFont(ofSize:25,weight:.medium)
        let description=NSTextField(wrappingLabelWithString:"Connect to the Windows PC that drives your lab monitor. Settings and laser reports will be shared with the display.");description.font = .systemFont(ofSize:13);description.textColor = .secondaryLabelColor
        addressField.placeholderString="DISPLAY-PC:8765";addressField.font = .systemFont(ofSize:14);addressField.target=self;addressField.action=#selector(connectPressed)
        let button=NSButton(title:"Connect to Display Computer",target:self,action:#selector(connectPressed));button.bezelStyle = .rounded
        message.font = .systemFont(ofSize:12);message.textColor = .secondaryLabelColor
        let stack=NSStackView(views:[title,description,addressField,button,message]);stack.orientation = .vertical;stack.alignment = .leading;stack.spacing=18;stack.translatesAutoresizingMaskIntoConstraints=false
        home.addSubview(stack)
        NSLayoutConstraint.activate([stack.widthAnchor.constraint(equalToConstant:460),stack.centerXAnchor.constraint(equalTo:home.centerXAnchor),stack.centerYAnchor.constraint(equalTo:home.centerYAnchor),addressField.widthAnchor.constraint(equalTo:stack.widthAnchor),description.widthAnchor.constraint(equalTo:stack.widthAnchor),message.widthAnchor.constraint(equalTo:stack.widthAnchor)])
        showHome()
    }
    required init?(coder:NSCoder) { fatalError("Not supported") }
    @objc func connectPressed() { appOwner?.connect(addressField.stringValue) }
    func showHome(_ text:String="") {
        loadPreview()
    }
    func loadPreview() {
        guard let page=Bundle.main.url(forResource:"Weld-Lab-Laser-Safety",withExtension:"html") else { return }
        webView.stopLoading()
        window?.contentView=webView
        window?.title=appName+" — Preview"
        webView.loadFileURL(page,allowingReadAccessTo:page.deletingLastPathComponent())
    }
    func loadTarget() {
        guard let base=appOwner?.connectionURL else { showHome();return }
        var parts=URLComponents(url:base,resolvingAgainstBaseURL:false)!;parts.query=monitor ? "display=1" : "control=1"
        window?.title=monitor ? appName+" — Monitor" : appName;window?.contentView=webView;webView.load(URLRequest(url:parts.url!,cachePolicy:.reloadIgnoringLocalCacheData,timeoutInterval:8))
    }
    func allowed(_ url:URL)->Bool {
        if url.isFileURL { return url.standardizedFileURL == Bundle.main.url(forResource:"Weld-Lab-Laser-Safety",withExtension:"html")?.standardizedFileURL }
        guard let base=appOwner?.connectionURL else { return false };return url.scheme==base.scheme && url.host==base.host && url.port==base.port }
    func webView(_ webView:WKWebView,decidePolicyFor action:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void) { guard let url=action.request.url else { decisionHandler(.cancel);return };decisionHandler(allowed(url) || url.absoluteString=="about:blank" ? .allow : .cancel) }
    func webView(_ webView:WKWebView,didFailProvisionalNavigation navigation:WKNavigation!,withError error:Error) { if (error as NSError).code != NSURLErrorCancelled { showHome("Could not connect. Check the display computer address and lab network, then try again.") } }
    func webView(_ webView:WKWebView,didFail navigation:WKNavigation!,withError error:Error) { if (error as NSError).code != NSURLErrorCancelled { showHome("Connection failed. Check the display computer address and lab network.") } }
    func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage) {
        guard message.frameInfo.isMainFrame,let url=message.frameInfo.request.url,allowed(url),let data=message.body as? [String:Any],let action=data["action"] as? String else { return }
        switch action {
        case "connectPi": if let address=data["address"] as? String { appOwner?.connect(address) }
        case "fullscreen": window?.toggleFullScreen(nil)
        case "monitorWindow": appOwner?.newWindow(monitor:true)
        case "spaceAppearance": if let enabled=data["enabled"] as? Bool { window?.appearance=NSAppearance(named:enabled ? .darkAqua : .aqua) }
        default: break
        }
    }
    func webView(_ webView:WKWebView,createWebViewWith configuration:WKWebViewConfiguration,for navigationAction:WKNavigationAction,windowFeatures:WKWindowFeatures)->WKWebView? { appOwner?.newWindow(monitor:true);return nil }
    func windowWillClose(_ notification:Notification) { webView.configuration.userContentController.removeScriptMessageHandler(forName:"weldApp");appOwner?.windows.removeAll(where:{$0 === self}) }
}

@main struct Launcher {
    @MainActor static func main() {
        if CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--make-iconset" {
            do { try makeIcons(at:CommandLine.arguments[2]); exit(0) }
            catch { fputs("Icon generation failed: \(error)\n",stderr);exit(1) }
        }
        let application=NSApplication.shared
        let applicationDelegate=AppDelegate()
        application.setActivationPolicy(.regular)
        application.delegate=applicationDelegate
        withExtendedLifetime(applicationDelegate) { application.run() }
    }
}
