import "./timeline.css";

import React, { Component } from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import Timeline, {
    TimelineMarkers,
    CustomMarker,
} from 'react-calendar-timeline';
import api from '../core/api-service.jsx';
import {CancelToken} from 'axios';
import { PrepareData } from '../core/table.jsx';
import VeloValueRenderer from '../utils/value.jsx';
import Form from 'react-bootstrap/Form';
import { JSONparse } from '../utils/json_parse.jsx';
import VeloTimestamp from "../utils/time.jsx";
import { localTimeFromUTCTime, utcTimeFromLocalTime } from '../utils/time.jsx';

// make sure you include the timeline stylesheet or the timeline will not be styled
import 'react-calendar-timeline/lib/Timeline.css';
import moment from 'moment';
import 'moment-timezone';
import Button from 'react-bootstrap/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Navbar from 'react-bootstrap/Navbar';
import T from '../i8n/i8n.jsx';
import Table from 'react-bootstrap/Table';
import ToolTip from '../widgets/tooltip.jsx';
import { ColumnToggle } from '../core/paged-table.jsx';
import Modal from 'react-bootstrap/Modal';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import { ToStandardTime } from '../utils/time.jsx';
import { ColumnFilter } from '../core/paged-table.jsx';
import DateTimePicker from 'react-datetime-picker';
import Dropdown from 'react-bootstrap/Dropdown';

const TenYears =  10 * 365 * 24 * 60 * 60 * 1000;

const FixedColumns = {
    "Timestamp": 1,
    "Description": 1,
    "Message": 1,
}

class AnnotationDialog extends Component {
    static propTypes = {
        Timestamp: PropTypes.number,
        event: PropTypes.object,
        notebook_id: PropTypes.string,
        super_timeline: PropTypes.string,
        onClose: PropTypes.func,
    }

    state = {
        note: "",
    }

    componentDidMount = () => {
        this.source = CancelToken.source();

        // If this is already an annotation, start with the previous
        // note.
        let event = this.props.event || {};
        this.setState({note: event.Notes});
    }

    componentWillUnmount() {
        this.source.cancel();
    }

    updateNote = ()=>{
        api.post("v1/AnnotateTimeline", {
            notebook_id: this.props.notebook_id,
            super_timeline: this.props.super_timeline,
            timestamp: this.props.timestamp,
            note: this.state.note,
            event_json: JSON.stringify(this.props.event),
        }, this.source.token).then(response=>{
            this.props.onClose();
        });
    }

    render() {
        return <Modal show={true}
                      size="lg"
                      dialogClassName="modal-90w"
                      onHide={this.props.onClose}>
                 <Modal.Header closeButton>
                   <Modal.Title>{T("Annotate Event")}</Modal.Title>
                 </Modal.Header>
                 <Modal.Body>
                   <VeloValueRenderer value={this.props.event}/>
                   <Form>
                     <Form.Group as={Row}>
                       <Form.Label column sm="3">{T("Note")}</Form.Label>
                       <Col sm="8">
                         <Form.Control as="textarea" rows={1}
                                       placeholder={T("Enter short annotation")}
                                       spellCheck="true"
                                       value={this.state.note || ""}
                                       onChange={e => this.setState({note: e.target.value})}
                         />
                         </Col>
                     </Form.Group>
                   </Form>
                 </Modal.Body>
                 <Modal.Footer>
                   <Button variant="secondary" onClick={this.props.onClose}>
                     {T("Close")}
                   </Button>
                   <Button variant="primary" onClick={this.updateNote}>
                     {T("Yes do it!")}
                   </Button>
                 </Modal.Footer>
               </Modal>;
    }
}


class TimelineTableRow extends Component {
    static propTypes = {
        row: PropTypes.object,
        columns: PropTypes.array,
        notebook_id: PropTypes.string,
        super_timeline: PropTypes.string,
        timeline_class: PropTypes.string,
        onUpdate: PropTypes.func,
        seekToTime: PropTypes.func,
    }

    state = {
        expanded: false,
        showAnnotateDialog: false,
    }

    componentDidMount = () => {
        this.source = CancelToken.source();
    }

    componentWillUnmount() {
        this.source.cancel();
    }

    // To delete the note we propagate the GUID and unset the time.
    deleteNote = ()=>{
        api.post("v1/AnnotateTimeline", {
            notebook_id: this.props.notebook_id,
            super_timeline: this.props.super_timeline,
            event_json: JSON.stringify({
                _AnnotationID: this.props.row._AnnotationID,
            }),
        }, this.source.token).then(response=>{
            this.props.onUpdate();
            this.setState({expanded: false});
        });
    }

    render() {
        let data = this.props.row || {};
        let row_class = "timeline-data ";
        if(!this.state.expanded) {
            row_class += "hidden";
        }

        let timestamp = ToStandardTime(data.Timestamp).getTime() * 1000000;

        // For normal rows we show the raw data.
        let message = data.Message;
        let event = data;
        let notes = data.Notes || "";

        return (
            <React.Fragment >
              <tr className="row-selected"
                  onClick={e=>this.setState({expanded: !this.state.expanded})}
              >
                <td className={"timeline-group " + this.props.timeline_class}>
                </td>
                <td className="time">
                  <VeloTimestamp usec={event.Timestamp || ""}/>
                </td>
                <td>
                  <VeloValueRenderer value={message}/>
                </td>
                {_.map(this.props.columns || [], (x, i)=>{
                    return <td key={i}>
                             <VeloValueRenderer value={event[x] || ""}/>
                           </td>;
                })}
                <td>
                  <VeloValueRenderer value={notes}/>
                </td>
              </tr>
              <tr className={row_class}>
                <td className={"timeline-group " + this.props.timeline_class}>
                </td>
                <td colSpan="30">
                  <ButtonGroup>
                    <ToolTip tooltip={T("Recenter event")}>
                      <Button variant="default"
                              onClick={()=>{
                                  this.props.seekToTime(event.Timestamp);
                                  this.setState({expanded: false});
                              }}
                      >
                        <FontAwesomeIcon icon="crosshairs"/>
                      </Button>
                    </ToolTip>

                    { data._Source !== "Annotation" ?
                      <ToolTip tooltip={T("Annotate event")}>
                        <Button variant="default"
                                onClick={()=>this.setState(
                                    {showAnnotateDialog: true})}
                        >
                          <FontAwesomeIcon icon="note-sticky"/>
                        </Button>
                      </ToolTip>
                      : <>
                          <ToolTip tooltip={T("Update Annotation")}>
                            <Button variant="default"
                                    onClick={()=>this.setState(
                                        {showAnnotateDialog: true})}
                            >
                              <FontAwesomeIcon icon="edit"/>
                            </Button>
                          </ToolTip>
                          <ToolTip tooltip={T("Delete Annotation")}>
                            <Button variant="default"
                                    onClick={()=>this.deleteNote()}
                            >
                              <FontAwesomeIcon icon="trash"/>
                            </Button>
                          </ToolTip>
                        </>
                    }
                  </ButtonGroup>
                  <VeloValueRenderer value={event} />
                </td>
              </tr>
              { this.state.showAnnotateDialog &&
                <AnnotationDialog
                  timestamp={timestamp}
                  notebook_id={this.props.notebook_id}
                  super_timeline={this.props.super_timeline}
                  event={data}
                  onClose={() => {
                      this.setState({showAnnotateDialog: false});
                      if(this.props.onUpdate) {
                          this.props.onUpdate();
                      };
                  }}
                />}
            </React.Fragment>
        );
    }
}



class TimelineTableRenderer  extends Component {
    static propTypes = {
        rows: PropTypes.array,
        timelines: PropTypes.object,
        extra_columns: PropTypes.array,
        notebook_id: PropTypes.string,
        super_timeline: PropTypes.string,
        onUpdate: PropTypes.func,
        transform: PropTypes.object,
        setTransform: PropTypes.func,
        seekToTime: PropTypes.func,
    }

    getTimelineClass = (name) => {
        if (name === "Annotation") {
            return "timeline-annotation";
        }

        let timelines = this.props.timelines.timelines;
        if (_.isArray(timelines)) {
            for(let i=0;i<timelines.length;i++) {
                if (timelines[i].id === name) {
                    return "timeline-item-" + (i + 1);
                };
            }
        }
        return "";
    }

    columns = [];

    renderRow = (row, idx)=>{
        let columns = this.columns.concat(this.props.extra_columns);
        return (
            <TimelineTableRow
              key={idx}
              notebook_id={this.props.notebook_id}
              super_timeline={this.props.super_timeline}
              timeline_class={this.getTimelineClass(_.toString(row._Source))}
              row={row}
              columns={columns}
              seekToTime={this.props.seekToTime}
              onUpdate={this.props.onUpdate}
            />
        );
    }

    render() {
        return <Table className="paged-table">
                <thead>
                  <tr className="paged-table-header">
                    <th></th>
                    <th className="time">
                      { T("Timestamp") }
                    </th>

                    <th className="message">
                      <table className="paged-table-header">
                        <tbody>
                          <tr>
                            <td>{ T("Message") }</td>
                            <td className="sort-element">
                              <ButtonGroup>
                                <ColumnFilter column="message"
                                              transform={this.props.transform}
                                              setTransform={this.props.setTransform}
                                />
                              </ButtonGroup>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>

                    {_.map(this.props.extra_columns || [], (x, i)=>{
                        return <th key={i}>
                                 { x }
                               </th>;
                    })}
                    <th className="notes">
                      { T("Notes") }
                    </th>

                  </tr>
                </thead>
                 <tbody className="fixed-table-body">
                   {_.map(this.props.rows, this.renderRow)}
                 </tbody>
               </Table>;
    }
}

class GroupRenderer extends Component {
    static propTypes = {
        group: PropTypes.object,
        setGroup: PropTypes.func,
        disabled: PropTypes.bool,
    }

    toggle = ()=>{
        let group = Object.assign({}, this.props.group);
        group.disabled = !group.disabled;
        this.props.setGroup(group);
    }

    render() {
        let group = this.props.group || {};
        let icon_class = "";
        if (this.props.disabled) {
            icon_class = "hidden_icon";
        }

        return (
            <ButtonGroup>
              <Button variant="outline-default"
                      onClick={this.toggle}>
                <span className={icon_class}>
                  <FontAwesomeIcon icon={
                      ["far", !group.disabled ?
                       "square-check" : "square"]
                  }/>
                </span>
              </Button>
              <Button variant="outline-default"
                onClick={this.toggle}>
                { group.title }
              </Button>
            </ButtonGroup>
        );
    }
}


export default class TimelineRenderer extends React.Component {
    static propTypes = {
        name: PropTypes.string,
        notebook_id: PropTypes.string,
        params: PropTypes.object,
    }

    componentDidMount = () => {
        this.source = CancelToken.source();
        this.fetchRows();
    }

    componentWillUnmount() {
        this.source.cancel();
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        if (!_.isEqual(prevState.version, this.state.version)) {
            return true;
        }

        if (!_.isEqual(prevState.start_time, this.state.start_time)) {
            this.fetchRows();
            return true;
        };

        if (!_.isEqual(prevState.row_count, this.state.row_count)) {
            this.fetchRows();
            return true;
        };

        if (!_.isEqual(prevState.transform, this.state.transform)) {
            this.fetchRows();
            return true;
        }

        return false;
    }

    handleTimeChange = (visibleTimeStart, visibleTimeEnd) => {
        this.setState({
            visibleTimeStart,
            visibleTimeEnd,
            scrolling: true
        });
    };

    state = {
        start_time: 0,
        table_start: 0,
        table_end: 0,
        loading: true,
        disabled: {},
        version: 0,
        row_count: 10,
        visibleTimeStart: 0,
        visibleTimeEnd: 0,
        toggles: {},
        transform: {},
        timelines: [],
    };

    fetchRows = (go_to_start_time) => {
        let skip_components = [];
        _.map(this.state.disabled, (v,k)=>{
            if(v) {
                skip_components.push(k);
            };
        });

        let start_time = (go_to_start_time || this.state.start_time) * 1000000;
        if (start_time < 1000000000) {
            start_time = 0;
        }

        let transform = this.state.transform || {};

        let params = {
            type: "TIMELINE",
            timeline: this.props.name,
            start_time: start_time,
            rows: this.state.row_count,
            skip_components: skip_components,
            notebook_id: this.props.notebook_id,
            filter_column: transform.filter_column,
            filter_regex: transform.filter_regex,
        };

        let url = "v1/GetTable";

        this.source.cancel();
        this.source = CancelToken.source();

        this.setState({loading: true});

        api.get(url, params, this.source.token).then((response) => {
            if (response.cancel) {
                return;
            }
            let start_time = (response.data.start_time / 1000000) || 0;
            let end_time = (response.data.end_time / 1000000) || 0;
            let pageData = PrepareData(response.data);
            let timelines = response.data.timelines;

            this.setState({
                table_start: start_time,
                table_end:  response.data.end_time / 1000000 || 0,
                columns: pageData.columns,
                rows: pageData.rows,
                version: Date(),
                timelines: timelines,
            });

            // If the visible table is outside the view port, adjust
            // the view port.
            if (this.state.visibleTimeStart === 0 ||
                start_time > this.state.visibleTimeEnd ||
                start_time < this.state.visibleTimeStart) {
                let diff = (this.state.visibleTimeEnd -
                            this.state.visibleTimeStart) || (60 * 60 * 10000);

                let visibleTimeStart = start_time - diff * 0.1;
                let visibleTimeEnd = start_time + diff * 0.9;
                this.setState({start_time: start_time,
                               visibleTimeStart: visibleTimeStart,
                               visibleTimeEnd: visibleTimeEnd});
            }

            this.updateToggles(pageData.rows);
        });
    };

    groupRenderer = ({ group }) => {
        return <GroupRenderer
                 setGroup={group=>{
                     let disabled = this.state.disabled;
                     disabled[group.id] = group.disabled;
                     this.setState({disabled: disabled});
                     this.fetchRows();
                 }}
                 group={group}
                 disabled={group.id === -1}
               />;


        if (group.id < 0) {
            return <div>{group.title}</div>;
        }

        return (
            <Form>
              <ButtonGroup>
                <Form.Check
                  className="custom-group"
                  type="checkbox"
                  label={group.title}
                  checked={!group.disabled}
                  onChange={()=>{
                      let disabled = this.state.disabled;
                      disabled[group.id] = !disabled[group.id];
                      this.setState({disabled: disabled});
                      this.fetchRows();
                  }}
                />
                <Button variant="default">
                  <FontAwesomeIcon icon="wrench" />
                </Button>
              </ButtonGroup>
            </Form>
        );
    };

    nextPage = ()=>{
        if (this.state.table_end > 0) {
            this.setState({start_time: this.state.table_end + 1});
        }
    }

    updateToggles = rows=>{
        // Find all unique columns
        let _columns={};
        let columns = [];
        let toggles = {...this.state.toggles};

        _.each(this.state.rows, row=>{
            _.each(row, (v, k)=>{
                if (_.isUndefined(_columns[k]) && !FixedColumns[k]) {
                    _columns[k]=1;
                    columns.push(k);

                    if(_.isUndefined(toggles[k])) {
                        toggles[k] = true;
                    }
                }
            });
        });

        this.setState({toggles: toggles, columns: columns});
    }

    renderColumnSelector = ()=>{
        return (
            <ColumnToggle
              columns={this.state.columns}
              toggles={this.state.toggles}
              onToggle={c=>{
                  if(c) {
                      let toggles = this.state.toggles;
                      toggles[c] = !toggles[c];
                      this.setState({toggles: toggles});
                  }
              }}
            />
        );
    }

    lastEvent = ()=>{
        let timelines = this.state.timelines || [];
        let last_event = 0;
        for(let i=0;i<timelines.length;i++) {
            if(last_event < timelines[i].end_time) {
                last_event = timelines[i].end_time;
            }
        }
        return last_event * 1000;
    }

    render() {
        let super_timeline = {timelines: this.state.timelines || []};
        if(_.isEmpty(super_timeline.timelines)) {
            if (_.isString(this.props.params)) {
                super_timeline = JSONparse(this.props.params);
                if(!super_timeline) {
                    return <></>;
                }
            } else if(_.isObject(this.props.params)) {
                super_timeline = this.props.params;
            }
        }

        // Special groups must come first.
        let groups = [{id: -1, title: "Table View"},
                      {id: "Annotation", title: "Annotation",
                       disabled: this.state.disabled.Annotation}];
        let items = [{
            id:-1, group: -1,
            start_time: this.state.table_start,
            end_time: this.state.table_end,
            canMove: false,
            canResize: false,
            canChangeGroup: false,
            itemProps: {
                className: 'timeline-table-item',
                style: {
                    background: undefined,
                    color: undefined,
                },
            },
        }];
        let smallest = 10000000000000000;
        let largest = 0;
        let timelines = super_timeline.timelines || [];

        for (let i=0;i<timelines.length;i++) {
            let timeline = super_timeline.timelines[i];
            let start = timeline.start_time * 1000;
            let end = timeline.end_time * 1000;
            if (start < smallest) {
                smallest = start;
            }

            if (end > largest) {
                largest = end;
            }

            // Handle the annotation timeline specifically
            if (timeline.id === "Annotation") {
                items.push({
                    id: i+1, group: timeline.id,
                    start_time: start,
                    end_time: end,
                    canMove: false,
                    canResize: false,
                    canChangeGroup: false,
                    itemProps: {
                        className: 'timeline-annotation',
                        style: {
                            background: undefined,
                            color: undefined,
                        }
                    },
                });

            } else {
                groups.push({
                    id: timeline.id,
                    disabled: this.state.disabled[timeline.id],
                    title: timeline.id,
                });

                items.push({
                    id: i+1, group: timeline.id,
                    start_time: start,
                    end_time: end,
                    canMove: false,
                    canResize: false,
                    canChangeGroup: false,
                    itemProps: {
                        className: 'timeline-item-' + ((i + 1) % 8),
                        style: {
                            background: undefined,
                            color: undefined,
                        }
                    },
                });
            }
        }

        if (smallest > largest) {
            smallest = largest;
        }

        if (_.isNaN(smallest) || smallest < 0) {
            smallest = 0;
            largest = 0;
        }

        if (largest - smallest > TenYears) {
            largest = smallest + TenYears;
        }

        let extra_columns = [];
        _.each(this.state.toggles, (v,k)=>{
            if(!v) { extra_columns.push(k); }});

        let page_sizes = _.map([10, 25, 30, 50, 100], x=>{
            return <Dropdown.Item
                     as={Button}
                     variant="default"
                     key={x}
                     active={x===this.state.row_count}
                     onClick={()=>this.setState({row_count: x})} >
                     { x }
                   </Dropdown.Item>;
        });

        return <div className="super-timeline">Super-timeline {this.props.name}
                 <Navbar className="toolbar">
                   <ButtonGroup>
                     { this.renderColumnSelector() }
                     <ToolTip tooltip={T("Go to First Event")}>
                       <Button title="Start"
                               onClick={()=>this.fetchRows(1)}
                               variant="default">
                         <FontAwesomeIcon icon="backward-fast"/>
                       </Button>
                     </ToolTip>

                     <ToolTip tooltip={T("Page Size")}>
                       <Dropdown as={ButtonGroup} >
                         <Dropdown.Toggle variant="default" id="dropdown-basic">
                           {this.state.row_count || 0}
                         </Dropdown.Toggle>

                         <Dropdown.Menu>
                           { page_sizes }
                         </Dropdown.Menu>
                       </Dropdown>
                     </ToolTip>
                     <DateTimePicker
                       value={localTimeFromUTCTime(new Date(this.state.start_time))}
                       className="btn-group"
                       showLeadingZeros={true}
                       onChange={value=>{
                           if (_.isDate(value)) {
                               let time = utcTimeFromLocalTime(value).getTime();
                               this.fetchRows(time);
                               this.setState({start_time: time});
                           }
                       }}/>
                     <ToolTip tooltip={T("Next Page")}>
                       <Button title="Next"
                               onClick={() => {this.nextPage(); }}
                               variant="default">
                         <FontAwesomeIcon icon="forward"/>
                       </Button>
                     </ToolTip>
                     <ToolTip tooltip={T("Last Event")}>
                       <Button title="Last"
                               onClick={() => {this.fetchRows(
                                   this.lastEvent() - 1000); }}
                               variant="default">
                         <FontAwesomeIcon icon="forward-fast"/>
                       </Button>
                     </ToolTip>

                   </ButtonGroup>
                 </Navbar>
                 <Timeline
                   groups={groups}
                   items={items}
                   defaultTimeStart={moment(smallest).add(-1, "day")}
                   defaultTimeEnd={moment(largest).add(1, "day")}
                   itemTouchSendsClick={true}
                   minZoom={5*60*1000}
                   dragSnap={1000}
                   onCanvasClick={(groupId, time, e) => {
                       this.setState({start_time: time});
                   }}
                   onItemSelect={(itemId, e, time) => {
                       this.setState({start_time: time});
                       return false;
                   }}
                   onItemClick={(itemId, e, time) => {
                       this.setState({start_time: time});
                       return false;
                   }}
                   groupRenderer={this.groupRenderer}
                   onTimeChange={this.handleTimeChange}
                   visibleTimeStart={this.state.visibleTimeStart}
                   visibleTimeEnd={this.state.visibleTimeEnd}
                 >
                   <TimelineMarkers>
                     <CustomMarker
                       date={this.state.start_time} >
                       { ({ styles, date }) => {
                           styles.backgroundColor = undefined;
                           styles.width = undefined;
                           return <div style={styles}
                                       className="timeline-marker"
                                  />;
                       }}
                     </CustomMarker>
                   </TimelineMarkers>
                 </Timeline>
                 { this.state.columns &&
                   <TimelineTableRenderer
                     super_timeline={this.props.name}
                     notebook_id={this.props.notebook_id}
                     timelines={super_timeline}
                     extra_columns={extra_columns}
                     onUpdate={this.fetchRows}
                     transform={this.state.transform}
                     setTransform={x=>this.setState({transform:x})}
                     seekToTime={t=>{
                         let time = ToStandardTime(t);
                         if (_.isDate(time)) {
                             this.setState({start_time: time.getTime()});
                             this.fetchRows(time.getTime());
                         }
                     }}
                     rows={this.state.rows} />
                 }
               </div>;
    }
}
